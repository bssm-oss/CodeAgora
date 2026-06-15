const HIGH_RISK_SPECULATIVE_PATTERNS = [
  /\bauth(?:entication|orization)? bypass\b/i,
  /\bpermission boundary\b/i,
  /\bprivilege escalation\b/i,
  /\bvalidation bypass\b|\bgate bypass\b|\brelease gate\b|\bdata integrity\b/i,
  /\bdata loss\b/i,
  /\bremote code execution\b|\brce\b/i,
  /\bsql injection\b|\bxss\b|\bcsrf\b|\bssrf\b/i,
  /\bsecret leak\b|\bcredential leak\b|\btoken leak\b/i,
  /인증\s*우회|권한\s*(?:경계|우회|상승)|검증\s*우회|릴리스\s*게이트|데이터\s*(?:무결성|손실)|코드\s*실행|인젝션|비밀\s*유출|토큰\s*유출/i,
];

export function containsHighRiskSpeculativeClaim(text: string): boolean {
  return HIGH_RISK_SPECULATIVE_PATTERNS.some((pattern) => pattern.test(text));
}
