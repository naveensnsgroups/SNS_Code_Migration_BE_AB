// Read-only, poll-driven endpoints the frontend calls on a repeating timer
// (see SNS_Code_Migration_FE/hooks/usePolling.ts) — /api/scan (routes/scan.ts)
// is the only endpoint that creates/mutates a session; these three just read it.
import express, { Request, Response } from 'express';
import Session from '../models/Session';
import FileContent from '../models/FileContent';

const router = express.Router();

router.get('/migrate/state', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId query parameter is required.' });

    const session = await Session.findOne({ sessionId }).lean();
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    // fileCount is filled in here rather than stored: it's a fact we already
    // hold (the files we saved at scan time), so it's counted from those
    // instead of taken from whatever the Scanner Agent's model reports.
    // File contents live in their own collection now (see FileContent) — a
    // project's aggregate source text can exceed MongoDB's 16MB single-
    // document limit, but no individual file ever does.
    const fileCount = await FileContent.countDocuments({ sessionId });
    const detectedStack = session.detectedStack
      ? { ...session.detectedStack, fileCount }
      : null;

    res.json({
      sessionId: session.sessionId,
      status: session.status,
      fileTree: session.fileTree || [],
      detectedStack,
      targetStack: session.targetStack ?? null,
      phases: session.phases || [],
      progress: session.progress ?? 0,
      currentFile: session.currentFile || '',
      migrationTaskList: session.migrationTaskList ?? null,
      ruleCoverageReport: session.ruleCoverageReport ?? null,
      graphResolutionSummary: session.graphResolutionSummary ?? null,
      fullProjectCheckResult: session.fullProjectCheckResult ?? null,
      planSanityWarning: session.planSanityWarning ?? null,
      // Human sign-off gate between planning and code generation. Written to
      // MongoDB by the Migration Planning Agent ('pending') and the separate
      // Migration Plan Approval Agent ('approved'/'disapproved'); the frontend
      // gates its Generate Code button on these, so they have to be read back
      // out here or an approval that really landed stays invisible to the UI.
      approvalStatus: session.approvalStatus ?? null,
      approvalNote: session.approvalNote ?? null,
      // Validation output the planning agent produces alongside the task list.
      planValidation: session.planValidation ?? null,
      graphValidation: session.graphValidation ?? null,
      // Categories whose extraction failed to parse during file analysis —
      // surfaces a silently hollow knowledge graph instead of hiding it.
      extractionWarnings: session.extractionWarnings ?? null,
      // Code generation runs one CHUNK of tasks per invocation and reports how
      // many are still outstanding. The frontend drives the loop off this, so
      // it has to be readable here: calling again while the count is dropping,
      // stopping when it reaches 0 or stalls. codeGenLastChunkGenerated is what
      // makes "stalled" detectable — a chunk that generated nothing means
      // calling again would loop forever.
      codeGenOutstandingCount: session.codeGenOutstandingCount ?? null,
      codeGenLastChunkGenerated: session.codeGenLastChunkGenerated ?? null,
      codeGenLastChunkLayer: session.codeGenLastChunkLayer ?? null,
      // What the master review pass actually caught and repaired this chunk.
      codeGenMasterFixCount: session.codeGenMasterFixCount ?? null,
      codeGenMasterReviewSummary: session.codeGenMasterReviewSummary ?? null,
      reportedIssues: session.reportedIssues || [],
      errorMessage: session.errorMessage ?? undefined,
      logs: session.logs || [],
      activeTool: session.activeTool ?? null,
      toolCallHistory: session.toolCallHistory || [],
      analysisReport: session.analysisReport ?? null,
      knowledgeGraph: session.knowledgeGraph ?? null,
      validFileCount: session.validFileCount ?? 0,
      emptyFileCount: session.emptyFileCount ?? 0,
      // {path, reason} pairs live under validationReport, not the plain
      // emptyFiles: [String] field — the frontend wants the reason too.
      emptyFiles: session.validationReport?.emptyFilesList || [],
      verificationReport: session.verificationReport ?? null,
    });
  } catch (err: any) {
    console.error('Failed to load session state:', err);
    res.status(500).json({ error: err.message || 'Failed to load session state.' });
  }
});

// Modernized-output file tree — separate from the legacy fileTree in /migrate/state.
// Empty until code generation has actually written modernized files, which hasn't
// been built yet — returning [] here is the honest "nothing generated yet" state,
// not a placeholder standing in for real data.
router.get('/migrate/tree', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId query parameter is required.' });

    const session = await Session.findOne({ sessionId }).lean();
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    res.json({ fileTree: session.modernFileTree || [], modernPath: session.modernPath || undefined });
  } catch (err: any) {
    console.error('Failed to load modern file tree:', err);
    res.status(500).json({ error: err.message || 'Failed to load modern file tree.' });
  }
});

// Token usage — null until real AI calls happen (none yet at the scan-only stage).
router.get('/migrate/tokens', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId query parameter is required.' });

    const session = await Session.findOne({ sessionId }).lean();
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    res.json({
      sessionId: session.sessionId,
      tokenUsage: session.tokenUsage ?? null,
      modelBreakdown: session.modelBreakdown || [],
    });
  } catch (err: any) {
    console.error('Failed to load session tokens:', err);
    res.status(500).json({ error: err.message || 'Failed to load session tokens.' });
  }
});

// Raw legacy source content for a single file, by path, plus its modernized
// counterpart (by the same path) once Code Generation has produced one.
router.get('/file', async (req: Request, res: Response) => {
  try {
    const { sessionId, path } = req.query;
    if (!sessionId || !path) {
      return res.status(400).json({ error: 'sessionId and path query parameters are required.' });
    }

    const session = await Session.findOne({ sessionId }).lean();
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const match = await FileContent.findOne({ sessionId, path }).lean();
    // Generated files live in the SAME collection as legacy files (Code
    // Generation writes them there, under a "<modernPath>/" prefix) — there is
    // no separate modernFileContents store. Route the found content into
    // modernContent (not content) when the path falls under that prefix, so
    // the UI's green "Modern" pane shows it instead of mislabeling it Legacy.
    const modernPrefix = session.modernPath ? `${session.modernPath}/` : null;
    const isModernPath = !!modernPrefix && typeof path === 'string' && path.startsWith(modernPrefix);
    res.json({
      content: !isModernPath && match ? match.content : null,
      // Populated only for binary files (images, icons, etc.) — see FileContent
      // schema and scan.ts for why this is separate from `content`.
      binaryContent: match ? (match.binaryContent ?? null) : null,
      modernContent: isModernPath && match ? match.content : null,
    });
  } catch (err: any) {
    console.error('Failed to load file content:', err);
    res.status(500).json({ error: err.message || 'Failed to load file content.' });
  }
});

export default router;
