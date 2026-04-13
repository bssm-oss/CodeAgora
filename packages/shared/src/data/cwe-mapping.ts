/**
 * CWE (Common Weakness Enumeration) mapping for common issue titles.
 * Maps lowercase issue title keywords to CWE IDs for enriched output.
 */

export interface CweEntry {
  id: number;
  name: string;
  url: string;
}

const CWE_PATTERNS: Array<{ pattern: RegExp; entry: CweEntry }> = [
  { pattern: /sql.?inject/i, entry: { id: 89, name: 'SQL Injection', url: 'https://cwe.mitre.org/data/definitions/89.html' } },
  { pattern: /xss|cross.?site.?script/i, entry: { id: 79, name: 'Cross-site Scripting', url: 'https://cwe.mitre.org/data/definitions/79.html' } },
  { pattern: /command.?inject|shell.?inject/i, entry: { id: 78, name: 'OS Command Injection', url: 'https://cwe.mitre.org/data/definitions/78.html' } },
  { pattern: /path.?travers/i, entry: { id: 22, name: 'Path Traversal', url: 'https://cwe.mitre.org/data/definitions/22.html' } },
  { pattern: /ssrf|server.?side.?request/i, entry: { id: 918, name: 'SSRF', url: 'https://cwe.mitre.org/data/definitions/918.html' } },
  { pattern: /hardcoded.?(password|secret|credential|key)/i, entry: { id: 798, name: 'Hard-coded Credentials', url: 'https://cwe.mitre.org/data/definitions/798.html' } },
  { pattern: /buffer.?overflow/i, entry: { id: 120, name: 'Buffer Overflow', url: 'https://cwe.mitre.org/data/definitions/120.html' } },
  { pattern: /null.?(pointer|dereference|reference)/i, entry: { id: 476, name: 'NULL Pointer Dereference', url: 'https://cwe.mitre.org/data/definitions/476.html' } },
  { pattern: /race.?condition/i, entry: { id: 362, name: 'Race Condition', url: 'https://cwe.mitre.org/data/definitions/362.html' } },
  { pattern: /open.?redirect|unvalidated.?redirect/i, entry: { id: 601, name: 'Open Redirect', url: 'https://cwe.mitre.org/data/definitions/601.html' } },
  { pattern: /deserialization|insecure.?deserializ/i, entry: { id: 502, name: 'Insecure Deserialization', url: 'https://cwe.mitre.org/data/definitions/502.html' } },
  { pattern: /missing.?auth|broken.?auth/i, entry: { id: 287, name: 'Improper Authentication', url: 'https://cwe.mitre.org/data/definitions/287.html' } },
  { pattern: /insufficient.?logging|missing.?log/i, entry: { id: 778, name: 'Insufficient Logging', url: 'https://cwe.mitre.org/data/definitions/778.html' } },
];

/**
 * Look up CWE entry for an issue title.
 * Returns undefined if no match found.
 */
export function lookupCwe(issueTitle: string): CweEntry | undefined {
  for (const { pattern, entry } of CWE_PATTERNS) {
    if (pattern.test(issueTitle)) return entry;
  }
  return undefined;
}
