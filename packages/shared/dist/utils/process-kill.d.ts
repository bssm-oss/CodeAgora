/**
 * Process-tree kill utilities (Unix-only).
 */
/**
 * Kill a process and its children (process group).
 * Unix-only: uses process.kill(-pid, signal).
 */
export declare function killProcessTree(pid: number, signal?: NodeJS.Signals): Promise<void>;
/**
 * Graceful kill: SIGTERM → wait → SIGKILL.
 */
export declare function gracefulKill(pid: number, timeoutMs?: number): Promise<void>;
//# sourceMappingURL=process-kill.d.ts.map