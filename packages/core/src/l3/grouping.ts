/**
 * L3 Head - Diff Grouping
 * Groups git diff into logical file groups for reviewer distribution.
 *
 * Strategy:
 * 1. Extract import relationships from diff content
 * 2. Group files that share import edges (co-dependent files)
 * 3. Fall back to depth-2 directory grouping for files with no import links
 */

export interface FileGroup {
  name: string;
  files: string[];
  diffContent: string;
  prSummary: string;
}

/**
 * Analyze git diff and group files by import relationships,
 * falling back to directory-based grouping.
 */
export function groupDiff(diffContent: string): FileGroup[] {
  const fileSections = splitDiffByFile(diffContent);
  const files = [...fileSections.keys()];

  if (files.length === 0) return [];

  // Build import graph from diff content
  const importGraph = buildImportGraph(fileSections);

  // Cluster files by connected components in the import graph
  const clusters = clusterByImports(files, importGraph);

  // Build file groups from clusters
  return clusters.map((cluster) => {
    const groupDiffContent = cluster
      .map((f) => fileSections.get(f) ?? '')
      .join('\n');

    const name = deriveGroupName(cluster);

    return {
      name,
      files: cluster,
      diffContent: groupDiffContent,
      prSummary: `Changes in ${name} (${cluster.length} file(s))`,
    };
  });
}

// ============================================================================
// Diff Splitting
// ============================================================================

/**
 * Split a unified diff into per-file sections.
 * Returns a Map of filePath -> diff section content.
 */
function splitDiffByFile(diff: string): Map<string, string> {
  const result = new Map<string, string>();
  const sections = diff.split(/(?=diff --git)/);

  for (const section of sections) {
    const match = section.match(/diff --git a\/(.+?) b\/(.+)/);
    if (match) {
      result.set(match[2], section);
    }
  }

  return result;
}

// ============================================================================
// Import Graph
// ============================================================================

/** Regex patterns for common import/require statements */
const IMPORT_PATTERNS = [
  // ES modules: import ... from './foo' or import './foo'
  /(?:import\s+.*?\s+from\s+|import\s+)['"]([^'"]+)['"]/g,
  // CommonJS: require('./foo')
  /require\(['"]([^'"]+)['"]\)/g,
  // Dynamic import: import('./foo')
  /import\(['"]([^'"]+)['"]\)/g,
];

/**
 * Build a graph of import relationships from diff content.
 * Returns adjacency list: filePath -> Set of files it imports (that are also in the diff).
 */
function buildImportGraph(fileSections: Map<string, string>): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const fileSet = new Set(fileSections.keys());

  for (const [filePath, content] of fileSections) {
    const edges = new Set<string>();

    for (const pattern of IMPORT_PATTERNS) {
      const matches = content.matchAll(new RegExp(pattern.source, pattern.flags));
      for (const match of matches) {
        const importPath = resolveImportPath(filePath, match[1]);
        // Only link to files that are also in the diff
        if (importPath && fileSet.has(importPath)) {
          edges.add(importPath);
        }
      }
    }

    graph.set(filePath, edges);
  }

  return graph;
}

/**
 * Resolve a relative import path to an absolute file path.
 * Handles: ./foo, ../bar. Tries common extensions.
 */
function resolveImportPath(fromFile: string, importSpecifier: string): string | null {
  // Skip package imports (no ./ or ../)
  if (!importSpecifier.startsWith('.')) return null;

  const fromDir = fromFile.includes('/') ? fromFile.substring(0, fromFile.lastIndexOf('/')) : '';
  const parts = importSpecifier.split('/');
  const dirParts = fromDir.split('/').filter(Boolean);

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      dirParts.pop();
    } else {
      dirParts.push(part);
    }
  }

  return dirParts.join('/');
}

// ============================================================================
// Clustering
// ============================================================================

/**
 * Cluster files into connected components using the import graph.
 * Files with no import links fall back to directory-based grouping.
 */
function clusterByImports(files: string[], graph: Map<string, Set<string>>): string[][] {
  const visited = new Set<string>();
  const clusters: string[][] = [];

  // BFS to find connected components
  for (const file of files) {
    if (visited.has(file)) continue;

    const cluster: string[] = [];
    const queue = [file];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      cluster.push(current);

      // Forward edges: files this file imports
      const imports = graph.get(current) ?? new Set();
      for (const dep of imports) {
        if (!visited.has(dep)) queue.push(dep);
      }

      // Reverse edges: files that import this file
      for (const [other, edges] of graph) {
        if (edges.has(current) && !visited.has(other)) {
          queue.push(other);
        }
      }
    }

    clusters.push(cluster);
  }

  // Merge single-file clusters by directory (depth-2)
  return mergeSingletons(clusters);
}

/**
 * Merge single-file clusters that share a depth-2 directory.
 */
function mergeSingletons(clusters: string[][]): string[][] {
  const multiFile = clusters.filter((c) => c.length > 1);
  const singletons = clusters.filter((c) => c.length === 1);

  if (singletons.length === 0) return multiFile;

  const dirGroups = new Map<string, string[]>();
  for (const [file] of singletons) {
    const dir = getDir(file);
    if (!dirGroups.has(dir)) dirGroups.set(dir, []);
    dirGroups.get(dir)!.push(file);
  }

  return [...multiFile, ...dirGroups.values()];
}

/**
 * Get depth-2 directory for grouping fallback.
 */
function getDir(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 2) return parts[0] || 'root';
  return `${parts[0]}/${parts[1]}`;
}

// ============================================================================
// Naming
// ============================================================================

/**
 * Derive a human-readable group name from a cluster of files.
 */
function deriveGroupName(files: string[]): string {
  if (files.length === 1) {
    return files[0];
  }

  // Find common prefix
  const parts = files.map((f) => f.split('/'));
  const minLen = Math.min(...parts.map((p) => p.length));
  const common: string[] = [];

  for (let i = 0; i < minLen; i++) {
    const segment = parts[0][i];
    if (parts.every((p) => p[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }

  if (common.length > 0) {
    return common.join('/');
  }

  return files[0].split('/')[0] || 'root';
}
