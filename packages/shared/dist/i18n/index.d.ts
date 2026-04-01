/**
 * Lightweight i18n module — no external dependencies.
 * Supports 'en' (default) and 'ko' locales.
 */
type Locale = 'en' | 'ko';
export declare function setLocale(lang: Locale): void;
export declare function getLocale(): Locale;
/**
 * Translate a key, with optional parameter interpolation.
 * Falls back to English if the key is missing in the current locale.
 * Falls back to the key itself if missing in English too.
 */
export declare function t(key: string, params?: Record<string, string | number>): string;
/**
 * Detect locale from environment.
 * Priority: CODEAGORA_LANG env var → system LANG → fallback 'en'.
 */
export declare function detectLocale(): Locale;
export {};
//# sourceMappingURL=index.d.ts.map