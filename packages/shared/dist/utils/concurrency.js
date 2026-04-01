/**
 * Lightweight concurrency limiter (like p-limit, no external dependency).
 *
 * Usage:
 *   const limit = pLimit(3);
 *   const results = await Promise.allSettled(
 *     tasks.map(t => limit(() => processTask(t)))
 *   );
 */
export function pLimit(concurrency) {
    if (concurrency < 1) {
        throw new RangeError('Concurrency must be >= 1');
    }
    let active = 0;
    const queue = [];
    function next() {
        if (queue.length > 0 && active < concurrency) {
            active++;
            queue.shift()();
        }
    }
    return (fn) => {
        return new Promise((resolve, reject) => {
            const run = () => {
                let p;
                try {
                    p = fn();
                }
                catch (err) {
                    // fn threw synchronously — decrement active and drain the queue
                    active--;
                    reject(err);
                    next();
                    return;
                }
                p.then((val) => {
                    active--;
                    resolve(val);
                    next();
                }, (err) => {
                    active--;
                    reject(err);
                    next();
                });
            };
            if (active < concurrency) {
                active++;
                run();
            }
            else {
                queue.push(run);
            }
        });
    };
}
