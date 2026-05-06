import { describe, expect, it } from 'vitest';
import { resolveReviewers } from '../l0/index.js';
import type { ReviewerEntry } from '../types/config.js';

const reviewers: ReviewerEntry[] = [
  { id: 'r1', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
  { id: 'r2', backend: 'codex', model: 'test', enabled: true, timeout: 120 },
];

const fileGroups = [
  { name: 'group-a', diffContent: 'diff-a', prSummary: 'A' },
  { name: 'group-b', diffContent: 'diff-b', prSummary: 'B' },
  { name: 'group-c', diffContent: 'diff-c', prSummary: 'C' },
];

describe('resolveReviewers', () => {
  it('covers every file group when there are more groups than reviewers', async () => {
    const result = await resolveReviewers(reviewers, fileGroups);

    expect(result.reviewerInputs).toHaveLength(3);
    expect(result.reviewerInputs.map((input) => input.groupName)).toEqual([
      'group-a',
      'group-b',
      'group-c',
    ]);
    expect(result.reviewerInputs.map((input) => input.config.id)).toEqual(['r1', 'r2', 'r1']);
  });
});
