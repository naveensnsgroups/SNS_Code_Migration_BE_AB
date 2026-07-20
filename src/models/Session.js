const mongoose = require('mongoose');
const config = require('../config');

// Loosely typed on purpose (Schema.Types.Mixed for nested structures) — this
// document's shape mirrors the frontend's SessionStateResponse contract
// (SNS_Code_Migration_FE/services/api.ts), which itself has several optional/
// nullable nested fields that vary by migration stage.
const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  status: { type: String, default: 'idle' },
  progress: { type: Number, default: 0 },
  currentFile: { type: String, default: '' },
  fileTree: { type: mongoose.Schema.Types.Mixed, default: [] },
  // Array, not a path-keyed object — Mongo field names containing "." or "/"
  // (e.g. "MyApp/x.cbl") are a known footgun for object-keyed Mixed fields.
  fileContents: { type: [{ path: String, content: String }], default: [] },
  detectedStack: { type: mongoose.Schema.Types.Mixed, default: null },
  targetStack: { type: mongoose.Schema.Types.Mixed, default: null },
  phases: { type: mongoose.Schema.Types.Mixed, default: [] },
  // Stage-1 Analysis result — markdown report from the single-pass analysis
  // AgentBuilder workflow. Null until that workflow completes.
  analysisReport: { type: String, default: null },
  // Structured entities/relationships extracted alongside analysisReport —
  // e.g. { nodes: [{id,type,label}], edges: [{from,to,relationship}] }.
  // Shape isn't a fixed schema on purpose (Mixed) — kept flexible for the
  // AI agent's actual output, same reasoning as detectedStack/phases above.
  knowledgeGraph: { type: mongoose.Schema.Types.Mixed, default: null },
  validFileCount: { type: Number, default: 0 },
  emptyFileCount: { type: Number, default: 0 },
  emptyFiles: [{ type: String }],
  validationReport: {
    frontendValidCount: { type: Number, default: 0 },
    frontendEmptyCount: { type: Number, default: 0 },
    backendValidCount: { type: Number, default: 0 },
    backendEmptyCount: { type: Number, default: 0 },
    emptyFilesList: [{
      path: { type: String },
      reason: { type: String }
    }]
  },
  migrationTaskList: { type: mongoose.Schema.Types.Mixed, default: null },
  // Generated (target-stack) output — mirrors fileTree/fileContents above,
  // populated once the Code Generation Agent runs. modernPath is the target
  // project's root folder name, shown in Explorer the same way the legacy
  // project's folder name is.
  modernFileTree: { type: mongoose.Schema.Types.Mixed, default: [] },
  modernFileContents: { type: [{ path: String, content: String }], default: [] },
  modernPath: { type: String, default: null },
  ruleCoverageReport: { type: mongoose.Schema.Types.Mixed, default: null },
  graphResolutionSummary: { type: mongoose.Schema.Types.Mixed, default: null },
  fullProjectCheckResult: { type: mongoose.Schema.Types.Mixed, default: null },
  planSanityWarning: { type: String, default: null },
  reportedIssues: { type: mongoose.Schema.Types.Mixed, default: [] },
  errorMessage: { type: String, default: null },
  logs: { type: mongoose.Schema.Types.Mixed, default: [] },
  activeTool: { type: mongoose.Schema.Types.Mixed, default: null },
  toolCallHistory: { type: mongoose.Schema.Types.Mixed, default: [] },
}, { timestamps: true });

// Third argument pins the actual MongoDB collection name, read from
// MONGODB_COLLECTION (see src/config.js) — instead of Mongoose's
// auto-generated default ("sessions"), so it matches whatever collection
// you've already set up in Compass.
module.exports = mongoose.model('Session', sessionSchema, config.mongodbCollection);
