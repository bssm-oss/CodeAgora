function groupDiff(diffContent) {
  const fileSections = splitDiffByFile(diffContent);
  const files = [...fileSections.keys()];
  if (files.length === 0) return [];
  const importGraph = buildImportGraph(fileSections);
  const clusters = clusterByImports(files, importGraph);
  return clusters.map((cluster) => {
    const groupDiffContent = cluster.map((f) => fileSections.get(f) ?? "").join("\n");
    const name = deriveGroupName(cluster);
    return {
      name,
      files: cluster,
      diffContent: groupDiffContent,
      prSummary: `Changes in ${name} (${cluster.length} file(s))`
    };
  });
}
function splitDiffByFile(diff) {
  const result = /* @__PURE__ */ new Map();
  const sections = diff.split(/(?=diff --git)/);
  for (const section of sections) {
    const match = section.match(/diff --git a\/(.+?) b\/(.+)/);
    if (match) {
      result.set(match[2], section);
    }
  }
  return result;
}
const IMPORT_PATTERNS = [
  // ES modules: import ... from './foo' or import './foo'
  /(?:import\s+.*?\s+from\s+|import\s+)['"]([^'"]+)['"]/g,
  // CommonJS: require('./foo')
  /require\(['"]([^'"]+)['"]\)/g,
  // Dynamic import: import('./foo')
  /import\(['"]([^'"]+)['"]\)/g
];
function buildImportGraph(fileSections) {
  const graph = /* @__PURE__ */ new Map();
  const fileSet = new Set(fileSections.keys());
  for (const [filePath, content] of fileSections) {
    const edges = /* @__PURE__ */ new Set();
    for (const pattern of IMPORT_PATTERNS) {
      const matches = content.matchAll(new RegExp(pattern.source, pattern.flags));
      for (const match of matches) {
        const importPath = resolveImportPath(filePath, match[1]);
        if (importPath && fileSet.has(importPath)) {
          edges.add(importPath);
        }
      }
    }
    graph.set(filePath, edges);
  }
  return graph;
}
function resolveImportPath(fromFile, importSpecifier) {
  if (!importSpecifier.startsWith(".")) return null;
  const fromDir = fromFile.includes("/") ? fromFile.substring(0, fromFile.lastIndexOf("/")) : "";
  const parts = importSpecifier.split("/");
  const dirParts = fromDir.split("/").filter(Boolean);
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      dirParts.pop();
    } else {
      dirParts.push(part);
    }
  }
  const resolved = dirParts.join("/");
  return resolved || null;
}
function clusterByImports(files, graph) {
  const visited = /* @__PURE__ */ new Set();
  const clusters = [];
  for (const file of files) {
    if (visited.has(file)) continue;
    const cluster = [];
    const queue = [file];
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      cluster.push(current);
      const imports = graph.get(current) ?? /* @__PURE__ */ new Set();
      for (const dep of imports) {
        if (!visited.has(dep)) queue.push(dep);
      }
      for (const [other, edges] of graph) {
        if (edges.has(current) && !visited.has(other)) {
          queue.push(other);
        }
      }
    }
    clusters.push(cluster);
  }
  return mergeSingletons(clusters);
}
function mergeSingletons(clusters) {
  const multiFile = clusters.filter((c) => c.length > 1);
  const singletons = clusters.filter((c) => c.length === 1);
  if (singletons.length === 0) return multiFile;
  const dirGroups = /* @__PURE__ */ new Map();
  for (const [file] of singletons) {
    const dir = getDir(file);
    if (!dirGroups.has(dir)) dirGroups.set(dir, []);
    dirGroups.get(dir).push(file);
  }
  return [...multiFile, ...dirGroups.values()];
}
function getDir(filePath) {
  const parts = filePath.split("/");
  if (parts.length <= 2) return parts[0] || "root";
  return `${parts[0]}/${parts[1]}`;
}
function deriveGroupName(files) {
  if (files.length === 1) {
    return files[0];
  }
  const parts = files.map((f) => f.split("/"));
  const minLen = Math.min(...parts.map((p) => p.length));
  const common = [];
  for (let i = 0; i < minLen; i++) {
    const segment = parts[0][i];
    if (parts.every((p) => p[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }
  if (common.length > 0) {
    return common.join("/");
  }
  return files[0].split("/")[0] || "root";
}
export {
  groupDiff
};
