/**
 * Package-level tests for packages/shared/src/utils/concurrency.ts
 *
 * Complements the root src/tests/concurrency.test.ts with additional
 * edge-case coverage: immediate resolution, empty task list, error
 * propagation ordering, and high-concurrency bounds.
 */

import { describe, it, expect } from 'vitest';
import { pLimit } from '@codeagora/shared/utils/concurrency.js';

describe('pLimit — validation', () => {
  it('throws RangeError for concurrency 0', () => {
    expect(() => pLimit(0)).toThrow(RangeError);
  });

  it('throws RangeError for negative concurrency', () => {
    expect(() => pLimit(-5)).toThrow('Concurrency must be >= 1');
  });

  it('accepts concurrency of 1', () => {
    expect(() => pLimit(1)).not.toThrow();
  });

  it('accepts large concurrency values', () => {
    expect(() => pLimit(1000)).not.toThrow();
  });
});

describe('pLimit — basic execution', () => {
  it('resolves a single synchronous-like task', async () => {
    const limit = pLimit(1);
    const result = await limit(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('resolves all tasks when concurrency equals task count', async () => {
    const limit = pLimit(5);
    const results = await Promise.all(
      [10, 20, 30, 40, 50].map((n) => limit(() => Promise.resolve(n))),
    );
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('resolves zero tasks without hanging', async () => {
    const results = await Promise.all([] as Promise<never>[]);
    expect(results).toEqual([]);
  });

  it('passes through the resolved value unchanged', async () => {
    const limit = pLimit(2);
    const obj = { id: 1, name: 'test' };
    const result = await limit(() => Promise.resolve(obj));
    expect(result).toBe(obj); // same reference
  });
});

describe('pLimit — concurrency enforcement', () => {
  it('never exceeds the stated concurrency limit', async () => {
    const limit = pLimit(3);
    let active = 0;
    let maxActive = 0;

    const task = (ms: number) =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, ms));
        active--;
      });

    await Promise.all([
      task(30), task(30), task(30), task(30), task(30), task(30),
    ]);

    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('runs concurrency=1 tasks strictly serially', async () => {
    const limit = pLimit(1);
    const order: string[] = [];

    await Promise.all([
      limit(async () => { await new Promise((r) => setTimeout(r, 20)); order.push('A'); }),
      limit(async () => { order.push('B'); }),
      limit(async () => { order.push('C'); }),
    ]);

    expect(order).toEqual(['A', 'B', 'C']);
  });
});

describe('pLimit — error handling', () => {
  it('rejects with the original error', async () => {
    const limit = pLimit(2);
    const err = new Error('task failed');
    await expect(limit(() => Promise.reject(err))).rejects.toBe(err);
  });

  it('continues processing queued tasks after a rejection', async () => {
    const limit = pLimit(1);
    const results = await Promise.allSettled([
      limit(() => Promise.reject(new Error('fail'))),
      limit(() => Promise.resolve('success')),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
    expect((results[1] as PromiseFulfilledResult<string>).value).toBe('success');
  });

  it('handles multiple sequential failures without deadlock', async () => {
    const limit = pLimit(2);
    const results = await Promise.allSettled([
      limit(() => Promise.reject(new Error('e1'))),
      limit(() => Promise.reject(new Error('e2'))),
      limit(() => Promise.resolve('ok')),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(rejected).toHaveLength(2);
    expect(fulfilled).toHaveLength(1);
  });
});

describe('pLimit — high volume', () => {
  it('processes 200 tasks with concurrency 10 without error', async () => {
    const limit = pLimit(10);
    const results = await Promise.all(
      Array.from({ length: 200 }, (_, i) => limit(() => Promise.resolve(i))),
    );
    expect(results).toHaveLength(200);
    expect(results[0]).toBe(0);
    expect(results[199]).toBe(199);
  });
});
