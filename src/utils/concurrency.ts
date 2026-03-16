/**
 * Lightweight concurrency limiter (like p-limit, no external dependency).
 *
 * Usage:
 *   const limit = pLimit(3);
 *   const results = await Promise.allSettled(
 *     tasks.map(t => limit(() => processTask(t)))
 *   );
 */

export function pLimit(concurrency: number) {
  if (concurrency < 1) {
    throw new RangeError('Concurrency must be >= 1');
  }

  let active = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (queue.length > 0 && active < concurrency) {
      active++;
      queue.shift()!();
    }
  }

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        fn().then(
          (val) => {
            active--;
            resolve(val);
            next();
          },
          (err) => {
            active--;
            reject(err);
            next();
          },
        );
      };

      if (active < concurrency) {
        active++;
        run();
      } else {
        queue.push(run);
      }
    });
  };
}
