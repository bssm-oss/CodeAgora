const SECRET_ASSIGNMENT_RE = /\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)|(?:api[_-]?key|token|secret|password))\s*[:=]\s*(["']?)[^\s"']+\2/gi;
const STANDALONE_SECRET_RE = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[0-9A-Za-z_-]{12,})\b/g;

export function redactSecrets(input: string): string {
  return input
    .replace(SECRET_ASSIGNMENT_RE, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(STANDALONE_SECRET_RE, '[REDACTED]');
}

export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return redactSecrets(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, entry]) => [key, redactDeep(entry)] as const);
    return Object.fromEntries(entries) as T;
  }

  return value;
}
