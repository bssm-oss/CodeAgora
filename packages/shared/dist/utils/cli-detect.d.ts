/**
 * CLI Backend Detection
 * Detects which CLI code-review backends are available on the system.
 */
export declare const CLI_BACKENDS: readonly [{
    readonly backend: "aider";
    readonly bin: "aider";
}, {
    readonly backend: "claude";
    readonly bin: "claude";
}, {
    readonly backend: "cline";
    readonly bin: "cline";
}, {
    readonly backend: "codex";
    readonly bin: "codex";
}, {
    readonly backend: "copilot";
    readonly bin: "copilot";
}, {
    readonly backend: "cursor";
    readonly bin: "agent";
}, {
    readonly backend: "gemini";
    readonly bin: "gemini";
}, {
    readonly backend: "goose";
    readonly bin: "goose";
}, {
    readonly backend: "kiro";
    readonly bin: "kiro-cli";
}, {
    readonly backend: "opencode";
    readonly bin: "opencode";
}, {
    readonly backend: "qwen-code";
    readonly bin: "qwen";
}, {
    readonly backend: "vibe";
    readonly bin: "vibe";
}];
export interface DetectedCli {
    backend: string;
    bin: string;
    available: boolean;
    path?: string;
}
/**
 * Detect which CLI backends are available on the system.
 *
 * Runs all checks in parallel via Promise.allSettled.
 * Never throws — every backend returns a result regardless of errors.
 *
 * Results are sorted alphabetically by backend name.
 */
export declare function detectCliBackends(): Promise<DetectedCli[]>;
//# sourceMappingURL=cli-detect.d.ts.map