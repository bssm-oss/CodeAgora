import fs from 'fs';
import { describe, it, expect } from 'vitest';

describe('package runtime data packaging', () => {
  it('verify-package-contents includes checks for shared model/pricing data', () => {
    const verifier = fs.readFileSync('scripts/verify-package-contents.mjs', 'utf-8');
    expect(verifier).toContain('packages/shared');
    expect(verifier).toContain('model-rankings.json');
    expect(verifier).toContain('groq-models.json');
    expect(verifier).toContain('pricing.json');
  });
});
