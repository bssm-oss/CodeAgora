import { describe, expect, it } from 'vitest';
import { isCompactMobileViewport, resolveRunMobileStep } from '../../packages/desktop/src/layout.js';

describe('desktop layout helpers', () => {
  it('treats the desktop mobile breakpoint as compact', () => {
    expect(isCompactMobileViewport(760)).toBe(true);
    expect(isCompactMobileViewport(761)).toBe(false);
  });

  it('clamps run steps to the available mobile flow', () => {
    expect(resolveRunMobileStep(3, false, false)).toBe(1);
    expect(resolveRunMobileStep(3, true, false)).toBe(2);
    expect(resolveRunMobileStep(3, true, true)).toBe(3);
  });
});
