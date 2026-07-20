import express, { Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import Session from '../models/Session';
import FileContent from '../models/FileContent';
import { buildFileTree, projectNameFromPaths, slugify } from '../lib/fileTree';
import DEFAULT_PHASES from '../lib/defaultPhases';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Content-based binary detection — a defense-in-depth backup to the
// frontend's extension/folder filter. That filter can only catch types it
// already knows about; this catches anything binary regardless of
// extension, by sniffing for null bytes (real text essentially never
// contains them; binary formats almost always do near the start of file).
function isLikelyBinary(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8000);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

router.post('/scan', upload.array('files'), async (req: Request, res: Response) => {
  try {
    let paths: string[] = [];
    try {
      paths = JSON.parse(req.body.paths || '[]');
    } catch {
      return res.status(400).json({ error: 'Invalid "paths" field — expected a JSON array.' });
    }
    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'No file paths received.' });
    }

    const projectSlug = slugify(projectNameFromPaths(paths));
    const sessionId = `${projectSlug}-${uuidv4().slice(0, 8)}`;
    const fileTree = buildFileTree(paths);

    // req.files and paths are index-aligned — the frontend appends one 'files'
    // entry and one paths[] entry per file, in the same loop iteration.
    // fileTree (above) is built from the full paths[] regardless — a binary
    // asset gets its own FileContent document with `content` empty (so its
    // path survives into the pipeline for the Validation Code Node's
    // ASSET_EXTENSIONS check to classify it as 'asset-file' downstream, and
    // so it never bloats an LLM prompt) but `binaryContent` populated as
    // base64, so CodeViewer can still render it as an actual image preview.
    const files = (req.files as Express.Multer.File[]) || [];
    const fileEntries = files
      .map((file, i) => ({ path: paths[i], buffer: file.buffer }))
      .filter(f => f.path)
      .map(f => {
        const binary = isLikelyBinary(f.buffer);
        return {
          path: f.path,
          content: binary ? '' : f.buffer.toString('utf-8'),
          binaryContent: binary ? f.buffer.toString('base64') : null,
          rawBytes: f.buffer.length,
        };
      });

    // A single file this large would be unusual for real source code, but
    // guard against it anyway — MongoDB still caps a single document (and
    // FileContent stores one file per document) at 16MB. Checked against the
    // raw upload size, not the stored string — binary files store base64 in
    // `binaryContent` (larger than the raw bytes) while `content` is empty.
    const MAX_SINGLE_FILE_BYTES = 15 * 1024 * 1024;
    const oversizedFile = fileEntries.find(f => f.rawBytes > MAX_SINGLE_FILE_BYTES);
    if (oversizedFile) {
      return res.status(413).json({
        error: `File "${oversizedFile.path}" is too large to store (over ${(MAX_SINGLE_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB). Exclude it and try again.`,
      });
    }

    await Session.create({
      sessionId,
      status: 'idle',
      progress: 0,
      currentFile: '',
      fileTree,
      // Content lives in the FileContent collection now, not embedded here —
      // see the insertMany below. Keeping this empty (not omitted) matches
      // the schema's documented shape for anything still reading it directly.
      fileContents: [],
      detectedStack: null,
      phases: DEFAULT_PHASES,
    });

    if (fileEntries.length > 0) {
      await FileContent.insertMany(
        fileEntries.map(f => ({ sessionId, path: f.path, content: f.content, binaryContent: f.binaryContent }))
      );
    }

    res.json({ sessionId });
  } catch (err: any) {
    console.error('Scan failed:', err);
    res.status(500).json({ error: err.message || 'Scan failed.' });
  }
});

export default router;
