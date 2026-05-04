const SECRET_ASSIGNMENT_RE = /\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)|(?:api[_-]?key|token|secret|password))\s*[:=]\s*(["']?)([^\s"']+)\2/gi;
const STANDALONE_SECRET_RE = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[0-9A-Za-z_-]{12,})\b/g;
const ENCODED_TOKEN_RE = /\b(?:[A-Za-z0-9+/]{12,}={0,2}|[A-Za-z0-9_.~%-]*%[0-9A-Fa-f]{2}[A-Za-z0-9_.~%-]*)\b/g;
const AUTHORIZATION_BEARER_TOKEN_RE = /\b(Authorization\s*:\s*Bearer\s+)([^\s"']+)/gi;
const BEARER_TOKEN_RE = /\b(Bearer\s+)([A-Za-z0-9._~+/=-]+)/g;

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
    .replace(AUTHORIZATION_BEARER_TOKEN_RE, (_match, prefix: string) => `${prefix}[REDACTED]`)
    .replace(BEARER_TOKEN_RE, (_match, prefix: string) => `${prefix}[REDACTED]`)
    .replace(STANDALONE_SECRET_RE, '[REDACTED]')
    .replace(ENCODED_TOKEN_RE, (match) => containsKnownSecret(match) ? '[REDACTED]' : match);
}

export function redactDeep<T>(value: T): T {
  const active = new WeakSet<object>();
  const cloned = new WeakMap<object, unknown>();

  function visit<V>(entry: V): V {
    if (typeof entry === 'string') {
      return redactSecrets(entry) as V;
    }

    if (Array.isArray(entry)) {
      if (active.has(entry)) {
        return '[Circular]' as V;
      }
      const cached = cloned.get(entry);
      if (cached) {
        return cached as V;
      }
      const output: unknown[] = [];
      cloned.set(entry, output);
      active.add(entry);
      for (const item of entry) {
        output.push(visit(item));
      }
      active.delete(entry);
      return output as V;
    }

    if (entry && typeof entry === 'object') {
      if (active.has(entry)) {
        return '[Circular]' as V;
      }
      const cached = cloned.get(entry);
      if (cached) {
        return cached as V;
      }
      const output: Record<string, unknown> = {};
      cloned.set(entry, output);
      active.add(entry);
      for (const [key, item] of Object.entries(entry)) {
        output[key] = visit(item);
      }
      active.delete(entry);
      return output as V;
    }

    return entry;
  }

  return visit(value);
}
