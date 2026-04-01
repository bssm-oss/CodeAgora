/**
 * Regex-based function/class scope detection.
 * Lightweight — no AST parsing.
 */
export interface ScopeInfo {
    name: string;
    type: 'function' | 'class' | 'method' | 'unknown';
    startLine: number;
}
export declare function detectLanguage(filePath: string): 'ts' | 'python' | 'go' | 'unknown';
export declare function detectScope(filePath: string, lineNumber: number, codeLines: string[]): ScopeInfo | null;
//# sourceMappingURL=scope-detector.d.ts.map