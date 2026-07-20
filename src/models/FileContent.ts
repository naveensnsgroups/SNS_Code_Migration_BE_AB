import mongoose, { Schema, Document } from 'mongoose';

export interface IFileContent extends Document {
  sessionId: string;
  path: string;
  content: string;
  binaryContent: string | null;
}

// One document per file instead of embedding all file contents inside the
// Session document — a project's aggregate source text can exceed MongoDB's
// 16MB single-document limit, but no individual file ever comes close, so
// splitting storage this way removes that ceiling entirely.
const fileContentSchema = new Schema<IFileContent>({
  sessionId: { type: String, required: true, index: true },
  path: { type: String, required: true },
  // Not required — an empty file (0 bytes, e.g. a .gitkeep placeholder) is
  // legitimate data, not missing data. Mongoose's required validator
  // rejects empty strings by default, which isn't the right behavior here.
  content: { type: String, default: '' },
  // Base64 of the raw bytes, populated only for binary files (images, icons,
  // fonts, etc.) — kept separate from `content` on purpose: `content` feeds
  // LLM prompts and validation as plain text, and a base64 blob there would
  // both be useless to an LLM and bloat every prompt that includes it.
  binaryContent: { type: String, default: null },
}, { timestamps: true });

fileContentSchema.index({ sessionId: 1, path: 1 });

// Explicit collection name (not Mongoose's auto-pluralized default) so it's
// easy to find and query directly from AgentBuilder's MongoDB nodes, which
// talk to MongoDB directly and don't go through this backend at all.
export default mongoose.model<IFileContent>('FileContent', fileContentSchema, 'Code_Migration_Files');
