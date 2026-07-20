// Read-only, poll-driven endpoints the frontend calls on a repeating timer
// (see SNS_Code_Migration_FE/hooks/usePolling.ts) — /api/scan (routes/scan.js)
// is the only endpoint that creates/mutates a session; these three just read it.
const express = require('express');
const Session = require('../models/Session');
const FileContent = require('../models/FileContent');

const router = express.Router();

router.get('/migrate/state', async (req, res) => {
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
    });
  } catch (err) {
    console.error('Failed to load session state:', err);
    res.status(500).json({ error: err.message || 'Failed to load session state.' });
  }
});

// Modernized-output file tree — separate from the legacy fileTree in /migrate/state.
// Empty until code generation has actually written modernized files, which hasn't
// been built yet — returning [] here is the honest "nothing generated yet" state,
// not a placeholder standing in for real data.
router.get('/migrate/tree', async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId query parameter is required.' });

    const session = await Session.findOne({ sessionId }).lean();
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    res.json({ fileTree: session.modernFileTree || [], modernPath: session.modernPath || undefined });
  } catch (err) {
    console.error('Failed to load modern file tree:', err);
    res.status(500).json({ error: err.message || 'Failed to load modern file tree.' });
  }
});

// Token usage — null until real AI calls happen (none yet at the scan-only stage).
router.get('/migrate/tokens', async (req, res) => {
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
  } catch (err) {
    console.error('Failed to load session tokens:', err);
    res.status(500).json({ error: err.message || 'Failed to load session tokens.' });
  }
});

// Raw legacy source content for a single file, by path, plus its modernized
// counterpart (by the same path) once Code Generation has produced one.
router.get('/file', async (req, res) => {
  try {
    const { sessionId, path } = req.query;
    if (!sessionId || !path) {
      return res.status(400).json({ error: 'sessionId and path query parameters are required.' });
    }

    const session = await Session.findOne({ sessionId }).lean();
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const match = await FileContent.findOne({ sessionId, path }).lean();
    const modernMatch = (session.modernFileContents || []).find(f => f.path === path);
    res.json({
      content: match ? match.content : null,
      // Populated only for binary files (images, icons, etc.) — see FileContent
      // schema and scan.js for why this is separate from `content`.
      binaryContent: match ? (match.binaryContent ?? null) : null,
      modernContent: modernMatch ? modernMatch.content : null,
    });
  } catch (err) {
    console.error('Failed to load file content:', err);
    res.status(500).json({ error: err.message || 'Failed to load file content.' });
  }
});

module.exports = router;
