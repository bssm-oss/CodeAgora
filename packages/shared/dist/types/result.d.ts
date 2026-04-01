/**
 * Result type for functional error handling (no try/catch at boundaries)
 */
export type Result<T, E = string> = {
    success: true;
    data: T;
} | {
    success: false;
    error: E;
};
export declare function ok<T>(data: T): Result<T, never>;
export declare function err<E = string>(error: E): Result<never, E>;
//# sourceMappingURL=result.d.ts.map