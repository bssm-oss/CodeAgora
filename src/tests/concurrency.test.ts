/**
 * pLimit concurrency limiter tests
 */

import { describe, it, expect } from 'vitest';
import { pLimit } from '@codeagora/shared/utils/concurrency.js';

describe('pLimit', () => {
  it('throws on concurrency < 1', () => {
    expect(() => pLimit(0)).toThrow('Concurrency must be >= 1');
    expect(() => pLimit(-1)).toThrow('Concurrency must be >= 1');
  });

  it('runs tasks up to the concurrency limit', async () => {
    const limit = pLimit(2);
    let active = 0;
    let peak = 0;

    const task = () =>
      limit(async () => {
        active++;
        if (active > peak) peak = active;
        await new Promise((r) => setTimeout(r, 50));
        active--;
        return 'done';
      });

    const results = await Promise.all([task(), task(), task(), task()]);

    expect(results).toEqual(['done', 'done', 'done', 'done']);
    expect(peak).toBe(2);
  });

  it('propagates rejections without breaking the queue', async () => {
    const limit = pLimit(1);

    const results = await Promise.allSettled([
      limit(() => Promise.reject(new Error('fail'))),
      limit(() => Promise.resolve('ok')),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
    expect((results[1] as PromiseFulfilledResult<string>).value).toBe('ok');
  });

  it('handles concurrency of 1 (serial execution)', async () => {
    const limit = pLimit(1);
    const order: number[] = [];

    await Promise.all([
      limit(async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push(1);
      }),
      limit(async () => {
        order.push(2);
      }),
    ]);

    expect(order).toEqual([1, 2]);
  });

  it('handles many tasks without deadlock', async () => {
    const limit = pLimit(3);
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        limit(() => Promise.resolve(i))
      )
    );

    expect(results).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });
});
