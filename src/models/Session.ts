import mongoose, { Schema, Document } from 'mongoose';
import config from '../config';
import type { FileNode, MigrationPhase, FileContentEntry } from '../types';

// Loosely typed on purpose (`any`/Mixed for nested structures) — this
// document's shape mirrors the frontend's SessionStateResponse contract
// (SNS_Code_Migration_FE/services/api.ts), which itself has several optional/
// nullable nested fields that vary by migration stage. Structural fields
// (status, progress, phases, etc.) are precisely typed since those are what
// actually catch drift bugs between this backend and the frontend; the
// AI-agent-written fields (detectedStack, knowledgeGraph, migrationTaskList,
// etc.) stay `any` since their shape is whatever that agent's output is.
export interface ISession extends Document {
  sessionId: string;
  status: string;
  progress: number;
  currentFile: string;
  fileTree: FileNode[];
  fileContents: FileContentEntry[];
  detectedStack: any;
  targetStack: any;
  phases: MigrationPhase[];
  analysisReport: string | null;
  knowledgeGraph: any;
  validFileCount: number;
  emptyFileCount: number;
  emptyFiles: string[];
  validationReport: {
    frontendValidCount: number;
    frontendEmptyCount: number;
    backendValidCount: number;
    backendEmptyCount: number;
    emptyFilesList: { path: string; reason: string }[];
  };
  // Cross-check of analysisReport/knowledgeGraph claims against the actual
  // source files, written by a separate Verification Agent in the same
  // Update Document call — null until that agent runs. Mixed/`any` since its
  // shape (issues/verdict/summary) is AI-agent-defined, same reasoning as
  // knowledgeGraph above.
  verificationReport: any;
  migrationTaskList: any;
  modernFileTree: any;
  modernFileContents: FileContentEntry[];
  modernPath: string | null;
  ruleCoverageReport: any;
  graphResolutionSummary: any;
  fullProjectCheckResult: any;
  planSanityWarning: string | null;
  reportedIssues: any;
  errorMessage: string | null;
  logs: any;
  activeTool: any;
  toolCallHistory: any;
  // Not declared with explicit fields below — written directly to MongoDB by
  // AgentBuilder workflows, read back here via .lean() (which returns
  // whatever the document actually has, schema or not). Kept as index
  // signature rather than omitted, so routes reading them still type-check.
  [key: string]: any;
}

const sessionSchema = new Schema<ISession>({
  sessionId: { type: String, required: true, unique: true, index: true },
  status: { type: String, default: 'idle' },
  progress: { type: Number, default: 0 },
  currentFile: { type: String, default: '' },
  fileTree: { type: Schema.Types.Mixed, default: [] },
  // Array, not a path-keyed object — Mongo field names containing "." or "/"
  // (e.g. "MyApp/x.cbl") are a known footgun for object-keyed Mixed fields.
  fileContents: { type: [{ path: String, content: String }], default: [] },
  detectedStack: { type: Schema.Types.Mixed, default: null },
  targetStack: { type: Schema.Types.Mixed, default: null },
  phases: { type: Schema.Types.Mixed, default: [] },
  // Stage-1 Analysis result — markdown report from the single-pass analysis
  // AgentBuilder workflow. Null until that workflow completes.
  analysisReport: { type: String, default: null },
  // Structured entities/relationships extracted alongside analysisReport —
  // e.g. { nodes: [{id,type,label}], edges: [{from,to,relationship}] }.
  // Shape isn't a fixed schema on purpose (Mixed) — kept flexible for the
  // AI agent's actual output, same reasoning as detectedStack/phases above.
  knowledgeGraph: { type: Schema.Types.Mixed, default: null },
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
      reason: { type: String },
    }],
  },
  verificationReport: { type: Schema.Types.Mixed, default: null },
  migrationTaskList: { type: Schema.Types.Mixed, default: null },
  // Generated (target-stack) output — mirrors fileTree/fileContents above,
  // populated once the Code Generation Agent runs. modernPath is the target
  // project's root folder name, shown in Explorer the same way the legacy
  // project's folder name is.
  modernFileTree: { type: Schema.Types.Mixed, default: [] },
  modernFileContents: { type: [{ path: String, content: String }], default: [] },
  modernPath: { type: String, default: null },
  ruleCoverageReport: { type: Schema.Types.Mixed, default: null },
  graphResolutionSummary: { type: Schema.Types.Mixed, default: null },
  fullProjectCheckResult: { type: Schema.Types.Mixed, default: null },
  planSanityWarning: { type: String, default: null },
  reportedIssues: { type: Schema.Types.Mixed, default: [] },
  errorMessage: { type: String, default: null },
  logs: { type: Schema.Types.Mixed, default: [] },
  activeTool: { type: Schema.Types.Mixed, default: null },
  toolCallHistory: { type: Schema.Types.Mixed, default: [] },
}, { timestamps: true });

// Third argument pins the actual MongoDB collection name, read from
// MONGODB_COLLECTION (see src/config.ts) — instead of Mongoose's
// auto-generated default ("sessions"), so it matches whatever collection
// you've already set up in Compass.
export default mongoose.model<ISession>('Session', sessionSchema, config.mongodbCollection);
