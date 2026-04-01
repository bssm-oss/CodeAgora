/**
 * Diff Utilities - Code Snippet Extraction & Context Reading
 */
export interface DiffFileRange {
    file: string;
    ranges: Array<[start: number, end: number]>;
}
/**
 * Parse unified diff headers to extract which files and line ranges changed.
 * Reads `--- a/file`, `+++ b/file`, `@@ -a,b +c,d @@` headers.
 * Uses the new-file side (+) ranges for context reading.
 */
export declare function parseDiffFileRanges(diffContent: string): DiffFileRange[];
/**
 * Merge overlapping or adjacent ranges into non-overlapping ranges.
 * Input ranges must be [start, end] where start <= end.
 */
export declare function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]>;
/**
 * Read surrounding code context from source files for changed ranges.
 *
 * For each range [start, end], reads [start - contextLines, end + contextLines]
 * from the actual source file. Merges overlapping expanded ranges.
 * Skips files that don't exist (deleted files, permission errors).
 *
 * @param repoPath - Root path of the git repository
 * @param file - Relative file path within the repo
 * @param ranges - Line ranges that changed
 * @param contextLines - Number of surrounding lines to include
 * @returns Formatted string with file path and line-numbered code, or empty string
 */
export declare function readSurroundingContext(repoPath: string, file: string, ranges: Array<[number, number]>, contextLines: number): Promise<string>;
export interface CodeSnippet {
    filePath: string;
    lineRange: [number, number];
    code: string;
    context: string;
}
/**
 * Extract list of file paths from diff
 */
export declare function extractFileListFromDiff(diffContent: string): string[];
/**
 * Find best matching file path from a list using fuzzy matching
 */
export declare function fuzzyMatchFilePath(query: string, filePaths: string[]): string | null;
/**
 * Extract code snippet from diff with ±N lines context
 */
export declare function extractCodeSnippet(diffContent: string, filePath: string, lineRange: [number, number], contextLines?: number): CodeSnippet | null;
/**
 * Batch extract snippets for multiple issues
 */
export declare function extractMultipleSnippets(diffContent: string, issues: Array<{
    filePath: string;
    lineRange: [number, number];
}>, contextLines?: number): Map<string, CodeSnippet>;
//# sourceMappingURL=diff.d.ts.map