const SECRET_ASSIGNMENT_RE = /\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)|(?:api[_-]?key|token|secret|password))\s*[:=]\s*(["']?)([^\s"']+)\2/gi;
const STANDALONE_SECRET_RE = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[0-9A-Za-z_-]{12,})\b/g;
const ENCODED_TOKEN_RE = /\b(?:[A-Za-z0-9+/]{12,}={0,2}|[A-Za-z0-9_.~%-]*%[0-9A-Fa-f]{2}[A-Za-z0-9_.~%-]*)\b/g;

function decodedVariants(value: string): string[] {
  const variants = [value];

  if (value.includes('%')) {
    try {
      variants.push(decodeURIComponent(value));
    } catch {
      variants.push(value);
    }
  }

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0) {
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      if (/^[\x20-\x7E]+$/.test(decoded)) {
        variants.push(decoded);
      }
    } catch {
      variants.push(value);
    }
  }

  return variants;
}

function containsKnownSecret(value: string): boolean {
  return decodedVariants(value).some((variant) => {
    STANDALONE_SECRET_RE.lastIndex = 0;
    return STANDALONE_SECRET_RE.test(variant);
  });
}

export function redactSecrets(input: string): string {
  return input
    .replace(SECRET_ASSIGNMENT_RE, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(STANDALONE_SECRET_RE, '[REDACTED]')
    .replace(ENCODED_TOKEN_RE, (match) => containsKnownSecret(match) ? '[REDACTED]' : match);
}

export function redactDeep<T>(value: T): T {
  const seen = new WeakSet<object>();

  function visit<V>(entry: V): V {
    if (typeof entry === 'string') {
      return redactSecrets(entry) as V;
    }

    if (Array.isArray(entry)) {
      if (seen.has(entry)) {
        return '[Circular]' as V;
      }
      seen.add(entry);
      return entry.map((item) => visit(item)) as V;
    }

    if (entry && typeof entry === 'object') {
      if (seen.has(entry)) {
        return '[Circular]' as V;
      }
      seen.add(entry);
      const entries = Object.entries(entry).map(([key, item]) => [key, visit(item)] as const);
      return Object.fromEntries(entries) as V;
    }

    return entry;
  }

  return visit(value);
}
