/**
 * Path Rules Matcher (#408)
 * Apply path-based review rules from config to changed files.
 */

export interface PathRule {
  pattern: string;
  notes: string[];
}

/**
 * Simple glob pattern matching (supports *, **, and ? wildcards).
 * Replicates the logic from chunker.ts for consistency.
 */
function globToRegex(pattern: string): RegExp {
  let regex = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches any path segment(s)
        if (pattern[i + 2] === '/') {
          regex += '(?:.+/)?';
          i += 3;
        } else {
          regex += '.*';
          i += 2;
        }
      } else {
        // * matches anything except /
        regex += '[^/]*';
        i += 1;
      }
    } else if (char === '?') {
      regex += '[^/]';
      i += 1;
    } else if (char === '.') {
      regex += '\\.';
      i += 1;
    } else {
      // Escape all regex special characters
      regex += char.replace(/[\\^$.|+()[\]{}]/g, '\\$&');
      i += 1;
    }
  }

  return new RegExp(`^${regex}$`);
}

/**
 * Match changed files against path-based review rules and collect notes.
 *
 * @param changedFiles - List of changed file paths
 * @param pathRules - Array of path rule definitions from config
 * @returns Deduplicated array of matching notes
 */
export function matchPathRules(
  changedFiles: string[],
  pathRules: PathRule[],
): string[] {
  if (pathRules.length === 0 || changedFiles.length === 0) return [];

  const matchedNotes = new Set<string>();

  // Pre-compile patterns
  const compiled = pathRules.map((rule) => ({
    regex: globToRegex(rule.pattern),
    notes: rule.notes,
  }));

  for (const file of changedFiles) {
    for (const rule of compiled) {
      if (rule.regex.test(file)) {
        for (const note of rule.notes) {
          matchedNotes.add(note);
        }
      }
    }
  }

  return [...matchedNotes];
}
