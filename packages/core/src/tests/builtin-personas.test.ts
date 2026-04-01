import { describe, it, expect } from 'vitest';
import { getBuiltinPersona } from '../l1/builtin-personas.js';

describe('getBuiltinPersona', () => {
  it('returns non-empty string for "security"', () => {
    const result = getBuiltinPersona('security');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns non-empty string for "logic"', () => {
    const result = getBuiltinPersona('logic');
    expect(result).toBeTruthy();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns non-empty string for "api-contract"', () => {
    const result = getBuiltinPersona('api-contract');
    expect(result).toBeTruthy();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns non-empty string for "general"', () => {
    const result = getBuiltinPersona('general');
    expect(result).toBeTruthy();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns null for unknown persona', () => {
    const result = getBuiltinPersona('unknown');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = getBuiltinPersona('');
    expect(result).toBeNull();
  });

  it('security persona contains "OWASP"', () => {
    const result = getBuiltinPersona('security');
    expect(result).toContain('OWASP');
  });

  it('logic persona contains "race conditions"', () => {
    const result = getBuiltinPersona('logic');
    expect(result).toContain('Race conditions');
  });

  it('api-contract persona contains "backward compatibility"', () => {
    const result = getBuiltinPersona('api-contract');
    expect(result).toContain('backward compatibility');
  });

  it('general persona contains "maintainability"', () => {
    const result = getBuiltinPersona('general');
    expect(result).toContain('maintainability');
  });
});
