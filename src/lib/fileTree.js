// Builds a nested FileNode[] tree (matching SNS_Code_Migration_FE/types/index.ts)
// from a flat list of relative file paths, e.g. ["MyApp/src/x.cbl", "MyApp/y.sql"].
function buildFileTree(paths) {
  const root = [];

  function getOrCreateDirChildren(dirSegments) {
    let children = root;
    let currentPath = '';
    for (const segment of dirSegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let dirNode = children.find(n => n.type === 'directory' && n.name === segment);
      if (!dirNode) {
        dirNode = { name: segment, path: currentPath, type: 'directory', children: [] };
        children.push(dirNode);
      }
      children = dirNode.children;
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
function projectNameFromPaths(paths) {
  const firstPath = paths[0] || '';
  return firstPath.includes('/') ? firstPath.split('/')[0] : 'project';
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  );
}

module.exports = { buildFileTree, projectNameFromPaths, slugify };
