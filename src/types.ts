// Shared shapes used across models/routes — mirrors the equivalent types in
// SNS_Code_Migration_FE/types/index.ts. Keeping these in one place (instead
// of inlining object shapes at each usage site) is what actually catches the
// kind of bug this backend has hit before: a route returning a field the
// frontend's type doesn't expect, or vice versa.

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  migrated?: boolean;
  language?: string;
}

export interface MigrationPhase {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

export interface FileContentEntry {
  path: string;
  content: string;
}
