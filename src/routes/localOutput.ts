// Writes generated output (e.g. the Stage-1 Analysis report) to a folder on
// this machine's own filesystem — only meaningful because this backend runs
// locally, unlike the AgentBuilder workflows (cloud-hosted, no access to the
// user's disk). The frontend calls this whenever new output arrives and a
// Local Output Workspace Path is configured in Settings.
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

router.post('/local-output/write', (req: Request, res: Response) => {
  try {
    const { localOutputPath, fileName, content, subDir, relativePath } = req.body;
    if (!localOutputPath || content === undefined || (!fileName && !relativePath)) {
      return res.status(400).json({ error: 'localOutputPath, content, and either fileName or relativePath are required.' });
    }

    let fullPath: string;
    if (relativePath) {
      // Generated code trees are arbitrarily nested (e.g. app/api/routers/x.py),
      // unlike the single flat report/knowledge-graph files below — resolve
      // against localOutputPath and verify the result never escapes it, rather
      // than restricting to one path segment like fileName/subDir do.
      const resolvedBase = path.resolve(localOutputPath);
      const resolvedTarget = path.resolve(resolvedBase, relativePath);
      if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
        return res.status(400).json({ error: 'relativePath must resolve inside localOutputPath.' });
      }
      fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });
      fullPath = resolvedTarget;
    } else {
      // fileName (and subDir, if given) must be plain names, not nested or
      // relative paths — guards against writing outside localOutputPath
      // (e.g. "../../something").
      const safeName = path.basename(fileName);
      if (safeName !== fileName) {
        return res.status(400).json({ error: 'fileName must not contain path separators.' });
      }

      let targetDir = localOutputPath;
      if (subDir) {
        const safeSubDir = path.basename(subDir);
        if (safeSubDir !== subDir) {
          return res.status(400).json({ error: 'subDir must not contain path separators.' });
        }
        targetDir = path.join(localOutputPath, safeSubDir);
      }

      fs.mkdirSync(targetDir, { recursive: true });
      fullPath = path.join(targetDir, safeName);
    }

    fs.writeFileSync(fullPath, content, 'utf-8');
    res.json({ ok: true, path: fullPath });
  } catch (err: any) {
    console.error('Failed to write local output:', err);
    res.status(500).json({ error: err.message || 'Failed to write local output.' });
  }
});

export default router;
