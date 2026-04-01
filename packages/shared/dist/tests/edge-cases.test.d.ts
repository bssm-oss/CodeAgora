/**
 * Edge-case coverage for shared package modules.
 *
 * Covers: validateDiffPath (absolute path blocked, #4),
 * getNextSessionId concurrent calls (#5),
 * ensureDir EACCES (#17), readCacheIndex corrupt JSON (#18).
 *
 * Note: pLimit(0) and pLimit(-1) are already covered in utils-concurrency.test.ts.
 * Note: sanitizeShellArg edge cases are covered in packages/core/src/tests/l1-backend.test.ts.
 */
export {};
//# sourceMappingURL=edge-cases.test.d.ts.map