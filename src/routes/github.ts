import express, { Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import os from 'os';
import path from 'path';
import config from '../config';
import Session from '../models/Session';
import FileContent from '../models/FileContent';
import { buildFileTree, slugify, isLikelyBinary } from '../lib/fileTree';
import DEFAULT_PHASES from '../lib/defaultPhases';

const router = express.Router();
const execFileAsync = promisify(execFile);

// ── GitHub OAuth Device Flow ──────────────────────────────────────────────────
// The device flow is the same one the `gh` CLI and VS Code use: the backend
// asks GitHub for a user_code, the human enters it at github.com/login/device,
// and the backend polls until GitHub hands back an access token. It needs an
// OAuth App Client ID (with device flow enabled) — see config.githubOAuthClientId.

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

function resolveClientId(bodyClientId?: unknown): string {
  return (typeof bodyClientId === 'string' && bodyClientId.trim()) || config.githubOAuthClientId;
}

router.post('/auth/github/device', async (req: Request, res: Response) => {
  const clientId = resolveClientId(req.body?.clientId);
  if (!clientId) {
    return res.status(400).json({
      error: 'GitHub sign-in is not configured on the server. Set GITHUB_OAUTH_CLIENT_ID (a GitHub OAuth App Client ID with device flow enabled) in the backend .env.',
    });
  }

  try {
    const ghRes = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: clientId, scope: 'repo' }),
    });
    const data = (await ghRes.json().catch(() => ({}))) as Record<string, any>;
    if (!ghRes.ok || data.error || !data.device_code) {
      return res.status(400).json({
        error: data.error_description || data.error || 'GitHub rejected the device-code request. Check the OAuth App Client ID and that device flow is enabled for it.',
      });
    }
    return res.json({
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to start GitHub sign-in.' });
  }
});

router.post('/auth/github/poll', async (req: Request, res: Response) => {
  const clientId = resolveClientId(req.body?.clientId);
  const deviceCode = req.body?.deviceCode;
  if (!clientId) {
    return res.status(400).json({ error: 'GitHub sign-in is not configured on the server.' });
  }
  if (!deviceCode || typeof deviceCode !== 'string') {
    return res.status(400).json({ error: 'Missing deviceCode.' });
  }

  try {
    const ghRes = await fetch(GITHUB_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const data = (await ghRes.json().catch(() => ({}))) as Record<string, any>;

    // GitHub reports "still waiting" states as an `error` field on a 200 — these
    // are normal polling states, not failures, so map them to a status the
    // frontend's poll loop already understands.
    if (data.error) {
      const map: Record<string, string> = {
        authorization_pending: 'pending',
        slow_down: 'slow_down',
        expired_token: 'expired',
        access_denied: 'denied',
      };
      const status = map[data.error] || 'error';
      return res.json({ status, interval: data.interval, error: status === 'error' ? (data.error_description || data.error) : undefined });
    }

    if (!data.access_token) {
      return res.json({ status: 'error', error: 'GitHub did not return an access token.' });
    }

    // Resolve the signed-in identity so the UI can show "@login".
    let user: { login: string; name?: string } | undefined;
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${data.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'code-migration-platform' },
      });
      if (userRes.ok) {
        const u = (await userRes.json()) as Record<string, any>;
        user = { login: u.login, name: u.name || undefined };
      }
    } catch { /* identity is best-effort — the token still works without it */ }

    return res.json({ status: 'authorized', accessToken: data.access_token, user });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'GitHub sign-in polling failed.' });
  }
});

// ── GitHub Clone → Session ────────────────────────────────────────────────────
// Clones a repo with a shallow `git clone`, reads its text files, and creates a
// Session + FileContent documents exactly the way the upload (scan) path does —
// so a cloned repo flows into the rest of the pipeline identically to an
// uploaded folder.

// Directories never worth ingesting — VCS metadata, dependency caches, build
// output. Skipped wholesale so they never reach an LLM prompt or bloat storage.
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', '.turbo', 'coverage',
  '.venv', 'venv', '__pycache__', '.idea', '.vscode', 'vendor', 'target',
]);

const MAX_SINGLE_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_FILES = 5000;

// Accepts https/ssh/shorthand forms and returns { owner, repo } — used both to
// name the session and to rebuild a canonical HTTPS clone URL (so a token can be
// injected safely, without passing the user's raw string to git).
function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const s = input.trim().replace(/\.git$/, '');
  // git@github.com:owner/repo
  let m = s.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
  if (m) return { owner: m[1], repo: m[2] };
  // https://github.com/owner/repo(/...)
  m = s.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i);
  if (m) return { owner: m[1], repo: m[2] };
  // owner/repo shorthand
  m = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (m) return { owner: m[1], repo: m[2] };
  return null;
}

function collectFiles(rootDir: string, prefix: string): { path: string; buffer: Buffer }[] {
  const out: { path: string; buffer: Buffer }[] = [];
  function walk(dir: string, rel: string) {
    if (out.length >= MAX_TOTAL_FILES) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= MAX_TOTAL_FILES) return;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
      } else if (entry.isFile()) {
        const abs = path.join(dir, entry.name);
        let buffer: Buffer;
        try { buffer = fs.readFileSync(abs); } catch { continue; }
        if (buffer.length > MAX_SINGLE_FILE_BYTES) continue;
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        out.push({ path: `${prefix}/${relPath}`, buffer });
      }
    }
  }
  walk(rootDir, '');
  return out;
}

router.post('/github/clone', async (req: Request, res: Response) => {
  const { repoUrl, branch, accessToken } = (req.body || {}) as {
    repoUrl?: string; branch?: string; accessToken?: string;
  };

  if (!repoUrl || typeof repoUrl !== 'string') {
    return res.status(400).json({ error: 'Missing repoUrl.' });
  }
  const parsed = parseGithubRepo(repoUrl);
  if (!parsed) {
    return res.status(400).json({ error: 'Could not parse that as a GitHub repository. Use a URL like https://github.com/owner/repo.' });
  }

  // Build a canonical HTTPS clone URL ourselves (never pass the user's raw
  // string to git) — inject the token as the userinfo for a private repo.
  const auth = accessToken ? `x-access-token:${accessToken}@` : '';
  const cloneUrl = `https://${auth}github.com/${parsed.owner}/${parsed.repo}.git`;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-clone-'));
  try {
    const args = ['clone', '--depth', '1', '--single-branch'];
    if (branch && typeof branch === 'string' && branch.trim()) {
      args.push('--branch', branch.trim());
    }
    args.push(cloneUrl, tmpDir);

    try {
      await execFileAsync('git', args, { timeout: 120000, maxBuffer: 1024 * 1024 * 64 });
    } catch (gitErr: any) {
      // git writes the useful reason (auth failed, no such branch, not found) to
      // stderr — surface a cleaned-up version, never the token-bearing URL.
      const stderr: string = (gitErr?.stderr || gitErr?.message || '').toString();
      const safe = stderr.replace(new RegExp(accessToken || '\\0', 'g'), '***');
      let message = 'git clone failed.';
      if (/Authentication failed|could not read Username|403/i.test(safe)) {
        message = accessToken
          ? 'Authentication failed — the GitHub token may be invalid or lack access to this repository.'
          : 'This repository is private or was not found. Sign in with GitHub first, then try again.';
      } else if (/Remote branch .* not found|not found in upstream/i.test(safe)) {
        message = `Branch "${branch}" was not found in this repository.`;
      } else if (/repository .* not found|Could not resolve host|fatal: could not read/i.test(safe)) {
        message = 'Repository not found. Check the URL (and that you have access if it is private).';
      }
      return res.status(400).json({ error: message });
    }

    const prefix = parsed.repo;
    const collected = collectFiles(tmpDir, prefix);
    if (collected.length === 0) {
      return res.status(400).json({ error: 'The repository was cloned but contained no readable source files.' });
    }

    const paths = collected.map(f => f.path);
    const sessionId = `${slugify(parsed.repo)}-${uuidv4().slice(0, 8)}`;
    const fileTree = buildFileTree(paths);

    const fileEntries = collected.map(f => {
      const binary = isLikelyBinary(f.buffer);
      return {
        path: f.path,
        content: binary ? '' : f.buffer.toString('utf-8'),
        binaryContent: binary ? f.buffer.toString('base64') : null,
      };
    });

    await Session.create({
      sessionId,
      status: 'idle',
      progress: 0,
      currentFile: '',
      fileTree,
      fileContents: [],
      detectedStack: null,
      phases: DEFAULT_PHASES,
    });

    await FileContent.insertMany(
      fileEntries.map(f => ({ sessionId, path: f.path, content: f.content, binaryContent: f.binaryContent }))
    );

    return res.json({ sessionId });
  } catch (err: any) {
    console.error('GitHub clone failed:', err);
    return res.status(500).json({ error: err?.message || 'Clone failed.' });
  } finally {
    // Always remove the working copy — it can be large and holds a token-bearing
    // remote in .git/config.
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
});

export default router;
