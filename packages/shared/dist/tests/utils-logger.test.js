/**
 * Package-level tests for packages/shared/src/utils/logger.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionLogger, createLogger } from '@codeagora/shared/utils/logger.js';
// Suppress console output during tests
const originalNodeEnv = process.env.NODE_ENV;
beforeEach(() => {
    process.env.NODE_ENV = 'production';
});
afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
});
describe('SessionLogger — construction', () => {
    it('initialises with zero entries', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        expect(logger.getLogs()).toHaveLength(0);
    });
});
describe('SessionLogger — log methods', () => {
    it('debug() stores a DEBUG entry', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        logger.debug('d');
        expect(logger.getLogs()[0].level).toBe('DEBUG');
        expect(logger.getLogs()[0].message).toBe('d');
    });
    it('info() stores an INFO entry', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        logger.info('i');
        expect(logger.getLogs()[0].level).toBe('INFO');
    });
    it('warn() stores a WARN entry', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        logger.warn('w');
        expect(logger.getLogs()[0].level).toBe('WARN');
    });
    it('error() stores an ERROR entry', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        logger.error('e');
        expect(logger.getLogs()[0].level).toBe('ERROR');
    });
    it('attaches optional data payload', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        const payload = { x: 1 };
        logger.info('msg', payload);
        expect(logger.getLogs()[0].data).toEqual(payload);
    });
    it('data is undefined when not supplied', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        logger.info('msg');
        expect(logger.getLogs()[0].data).toBeUndefined();
    });
    it('stores the component name on every entry', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'my-svc');
        logger.debug('x');
        logger.info('y');
        for (const entry of logger.getLogs()) {
            expect(entry.component).toBe('my-svc');
        }
    });
    it('timestamp is a recent unix milliseconds value', () => {
        const before = Date.now();
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        logger.info('t');
        const after = Date.now();
        const ts = logger.getLogs()[0].timestamp;
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
    });
    it('preserves insertion order across levels', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        logger.debug('a');
        logger.warn('b');
        logger.error('c');
        expect(logger.getLogs().map((e) => e.message)).toEqual(['a', 'b', 'c']);
    });
});
describe('SessionLogger.getLogs()', () => {
    it('returns a defensive copy — mutations do not affect internal state', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        logger.info('entry');
        logger.getLogs().splice(0); // clear the returned copy
        expect(logger.getLogs()).toHaveLength(1);
    });
});
describe('SessionLogger.clear()', () => {
    it('empties the log buffer', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        logger.info('a');
        logger.warn('b');
        logger.clear();
        expect(logger.getLogs()).toHaveLength(0);
    });
    it('allows fresh logging after clear', () => {
        const logger = new SessionLogger('2026-03-21', '001', 'comp');
        logger.error('old');
        logger.clear();
        logger.debug('new');
        expect(logger.getLogs()[0].message).toBe('new');
    });
});
describe('createLogger()', () => {
    it('returns a SessionLogger instance', () => {
        expect(createLogger('2026-03-21', '001', 'svc')).toBeInstanceOf(SessionLogger);
    });
    it('factory-created logger accumulates entries normally', () => {
        const logger = createLogger('2026-03-21', '001', 'factory');
        logger.info('hello');
        expect(logger.getLogs()).toHaveLength(1);
        expect(logger.getLogs()[0].component).toBe('factory');
    });
});
