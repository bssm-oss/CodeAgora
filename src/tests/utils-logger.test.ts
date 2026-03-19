/**
 * Logger Utility Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionLogger, createLogger } from '@codeagora/shared/utils/logger.js';
import type { LogLevel } from '@codeagora/shared/utils/logger.js';

// Suppress console output during all tests.
const originalNodeEnv = process.env.NODE_ENV;
beforeEach(() => {
  process.env.NODE_ENV = 'production';
});
afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

// ---------------------------------------------------------------------------
// SessionLogger – construction
// ---------------------------------------------------------------------------

describe('SessionLogger constructor', () => {
  it('creates a logger instance without throwing', () => {
    expect(() => new SessionLogger('2026-03-10', '001', 'test-component')).not.toThrow();
  });

  it('starts with an empty log array', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'test-component');
    expect(logger.getLogs()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SessionLogger – log level methods
// ---------------------------------------------------------------------------

describe('SessionLogger.debug()', () => {
  it('adds an entry with level DEBUG', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'comp');
    logger.debug('debug message');
    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('DEBUG' as LogLevel);
  });

  it('stores the correct message', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'comp');
    logger.debug('hello debug');
    expect(logger.getLogs()[0].message).toBe('hello debug');
  });
});

describe('SessionLogger.info()', () => {
  it('adds an entry with level INFO', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'comp');
    logger.info('info message');
    expect(logger.getLogs()[0].level).toBe('INFO' as LogLevel);
  });
});

describe('SessionLogger.warn()', () => {
  it('adds an entry with level WARN', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'comp');
    logger.warn('warn message');
    expect(logger.getLogs()[0].level).toBe('WARN' as LogLevel);
  });
});

describe('SessionLogger.error()', () => {
  it('adds an entry with level ERROR', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'comp');
    logger.error('error message');
    expect(logger.getLogs()[0].level).toBe('ERROR' as LogLevel);
  });
});

// ---------------------------------------------------------------------------
// SessionLogger – log entry shape
// ---------------------------------------------------------------------------

describe('SessionLogger log entry fields', () => {
  it('entry contains timestamp, level, component, and message', () => {
    const before = Date.now();
    const logger = new SessionLogger('2026-03-10', '001', 'my-component');
    logger.info('test entry');
    const after = Date.now();

    const entry = logger.getLogs()[0];
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
    expect(entry.level).toBe('INFO');
    expect(entry.component).toBe('my-component');
    expect(entry.message).toBe('test entry');
  });

  it('entry has no data field when none is supplied', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'comp');
    logger.info('no data');
    expect(logger.getLogs()[0].data).toBeUndefined();
  });

  it('entry stores optional data payload', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'comp');
    const payload = { key: 'value', count: 42 };
    logger.info('with data', payload);
    expect(logger.getLogs()[0].data).toEqual(payload);
  });

  it('accumulates entries in insertion order', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'comp');
    logger.debug('first');
    logger.info('second');
    logger.warn('third');
    const logs = logger.getLogs();
    expect(logs).toHaveLength(3);
    expect(logs.map((e) => e.message)).toEqual(['first', 'second', 'third']);
  });
});

// ---------------------------------------------------------------------------
// SessionLogger.getLogs()
// ---------------------------------------------------------------------------

describe('SessionLogger.getLogs()', () => {
  it('returns a copy so mutations do not affect internal state', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'comp');
    logger.info('entry');
    const copy = logger.getLogs();
    copy.pop();
    // Internal array still has the entry
    expect(logger.getLogs()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// SessionLogger.clear()
// ---------------------------------------------------------------------------

describe('SessionLogger.clear()', () => {
  it('empties the log array', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'comp');
    logger.info('a');
    logger.warn('b');
    logger.clear();
    expect(logger.getLogs()).toHaveLength(0);
  });

  it('allows logging again after clear', () => {
    const logger = new SessionLogger('2026-03-10', '001', 'comp');
    logger.info('before clear');
    logger.clear();
    logger.error('after clear');
    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('after clear');
  });
});

// ---------------------------------------------------------------------------
// createLogger() factory
// ---------------------------------------------------------------------------

describe('createLogger()', () => {
  it('returns a SessionLogger instance', () => {
    const logger = createLogger('2026-03-10', '001', 'factory-comp');
    expect(logger).toBeInstanceOf(SessionLogger);
  });

  it('created logger uses the provided component name', () => {
    const logger = createLogger('2026-03-10', '001', 'factory-comp');
    logger.info('factory test');
    expect(logger.getLogs()[0].component).toBe('factory-comp');
  });
});
