import type { FileNode } from '../types';

// Builds a nested FileNode[] tree (matching SNS_Code_Migration_FE/types/index.ts)
// from a flat list of relative file paths, e.g. ["MyApp/src/x.cbl", "MyApp/y.sql"].
export function buildFileTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];

  function getOrCreateDirChildren(dirSegments: string[]): FileNode[] {
    let children = root;
    let currentPath = '';
    for (const segment of dirSegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let dirNode = children.find(n => n.type === 'directory' && n.name === segment);
      if (!dirNode) {
        dirNode = { name: segment, path: currentPath, type: 'directory', children: [] };
        children.push(dirNode);
      }
      children = dirNode.children!;
    }
    return children;
  }

  for (const relativePath of paths) {
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    const fileName = parts[parts.length - 1];
    const dirSegments = parts.slice(0, -1);
    const siblings = getOrCreateDirChildren(dirSegments);
    const dotIndex = fileName.lastIndexOf('.');
    const extension = dotIndex > 0 ? fileName.slice(dotIndex + 1) : undefined;

    siblings.push({
      name: fileName,
      path: relativePath,
      type: 'file',
      migrated: false,
      language: extension,
    });
  }

  return root;
}

// First path segment = the uploaded project's folder name.
export function projectNameFromPaths(paths: string[]): string {
  const firstPath = paths[0] || '';
  return firstPath.includes('/') ? firstPath.split('/')[0] : 'project';
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  );
}

// Content-based binary detection, shared by the upload (scan) and GitHub-clone
// ingestion paths. Sniffs for null bytes in the first 8KB — real text files
// essentially never contain them, binary formats almost always do near the
// start — so a binary asset can be stored with `content` empty (never bloating
// an LLM prompt) but its path still preserved for the pipeline.
export function isLikelyBinary(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8000);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}
