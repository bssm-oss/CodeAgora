import { describe, expect, it } from 'vitest';
import { activeReviewerCount, evaluateConfigPolicy } from '../../packages/desktop/src/readiness.js';

describe('desktop readiness helpers', () => {
  it('treats empty reviewer arrays as incomplete policy', () => {
    expect(evaluateConfigPolicy('{"reviewers":[]}')).toEqual({
      activeReviewers: 0,
      complete: false,
      validJson: true,
    });
  });

  it('ignores disabled reviewer entries when counting active reviewers', () => {
    const raw = JSON.stringify({
      reviewers: [
        { id: 'off', enabled: false },
        { id: 'on', enabled: true },
      ],
    });

    expect(evaluateConfigPolicy(raw)).toMatchObject({
      activeReviewers: 1,
      complete: true,
      validJson: true,
    });
  });

  it('supports declarative reviewer count configs', () => {
    expect(activeReviewerCount({ count: 3 })).toBe(3);
    expect(evaluateConfigPolicy('{"reviewers":{"count":3}}')).toMatchObject({
      activeReviewers: 3,
      complete: true,
      validJson: true,
    });
  });

  it('marks invalid JSON as invalid and incomplete', () => {
    expect(evaluateConfigPolicy('{ invalid json')).toEqual({
      activeReviewers: undefined,
      complete: false,
      validJson: false,
    });
  });
});
