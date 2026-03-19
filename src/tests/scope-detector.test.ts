/**
 * Scope Detector Tests
 */

import { describe, it, expect } from 'vitest';
import { detectLanguage, detectScope } from '@codeagora/shared/utils/scope-detector.js';

// ---------------------------------------------------------------------------
// detectLanguage
// ---------------------------------------------------------------------------

describe('detectLanguage', () => {
  it('returns ts for .ts', () => expect(detectLanguage('foo.ts')).toBe('ts'));
  it('returns ts for .tsx', () => expect(detectLanguage('foo.tsx')).toBe('ts'));
  it('returns ts for .js', () => expect(detectLanguage('foo.js')).toBe('ts'));
  it('returns ts for .jsx', () => expect(detectLanguage('foo.jsx')).toBe('ts'));
  it('returns python for .py', () => expect(detectLanguage('foo.py')).toBe('python'));
  it('returns go for .go', () => expect(detectLanguage('foo.go')).toBe('go'));
  it('returns unknown for .txt', () => expect(detectLanguage('foo.txt')).toBe('unknown'));
});

// ---------------------------------------------------------------------------
// detectScope — TS/JS
// ---------------------------------------------------------------------------

describe('detectScope — TS function', () => {
  it('finds plain function declaration', () => {
    const lines = [
      'function authenticate(username: string, password: string) {',
      '  return true;',
      '}',
    ];
    const result = detectScope('auth.ts', 2, lines);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('authenticate');
    expect(result!.type).toBe('function');
  });

  it('finds exported function declaration', () => {
    const lines = [
      'export function fetchData(url: string) {',
      '  return fetch(url);',
      '}',
    ];
    const result = detectScope('api.ts', 2, lines);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('fetchData');
    expect(result!.type).toBe('function');
  });

  it('finds async function declaration', () => {
    const lines = [
      'async function fetchData(url: string) {',
      '  const res = await fetch(url);',
      '  return res.json();',
      '}',
    ];
    const result = detectScope('api.ts', 3, lines);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('fetchData');
    expect(result!.type).toBe('function');
  });

  it('finds arrow function (const NAME = ... =>)', () => {
    const lines = [
      'const handler = async (req: Request) => {',
      '  return response;',
      '};',
    ];
    const result = detectScope('handler.ts', 2, lines);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('handler');
    expect(result!.type).toBe('function');
  });

  it('finds class declaration', () => {
    const lines = [
      'class UserService {',
      '  getUser(id: string) {',
      '    return null;',
      '  }',
      '}',
    ];
    const result = detectScope('service.ts', 3, lines);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('UserService');
    expect(result!.type).toBe('class');
  });
});

// ---------------------------------------------------------------------------
// detectScope — Python
// ---------------------------------------------------------------------------

describe('detectScope — Python', () => {
  it('finds def statement', () => {
    const lines = [
      'def process(data):',
      '    result = []',
      '    return result',
    ];
    const result = detectScope('script.py', 2, lines);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('process');
    expect(result!.type).toBe('function');
  });

  it('finds class declaration', () => {
    const lines = [
      'class MyModel(BaseModel):',
      '    name: str',
      '    age: int',
    ];
    const result = detectScope('model.py', 3, lines);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('MyModel');
    expect(result!.type).toBe('class');
  });
});

// ---------------------------------------------------------------------------
// detectScope — Go
// ---------------------------------------------------------------------------

describe('detectScope — Go', () => {
  it('finds func declaration', () => {
    const lines = [
      'func handleRequest(w http.ResponseWriter, r *http.Request) {',
      '    fmt.Fprintln(w, "ok")',
      '}',
    ];
    const result = detectScope('server.go', 2, lines);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('handleRequest');
    expect(result!.type).toBe('function');
  });

  it('finds method with receiver', () => {
    const lines = [
      'func (s *Server) Listen(addr string) error {',
      '    return s.http.ListenAndServe(addr, nil)',
      '}',
    ];
    const result = detectScope('server.go', 2, lines);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Listen');
    expect(result!.type).toBe('method');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('detectScope — edge cases', () => {
  it('returns null when no match within 50 lines', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i} = ${i};`);
    const result = detectScope('file.ts', 60, lines);
    expect(result).toBeNull();
  });

  it('returns null for empty codeLines', () => {
    const result = detectScope('file.ts', 1, []);
    expect(result).toBeNull();
  });

  it('returns null for unknown file extension', () => {
    const lines = ['function foo() {', '  return 1;', '}'];
    const result = detectScope('file.txt', 2, lines);
    expect(result).toBeNull();
  });
});
