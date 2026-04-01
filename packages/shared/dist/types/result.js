/**
 * Result type for functional error handling (no try/catch at boundaries)
 */
export function ok(data) {
    return { success: true, data };
}
export function err(error) {
    return { success: false, error };
}
