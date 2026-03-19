/**
 * Lightweight i18n module — no external dependencies.
 * Supports 'en' (default) and 'ko' locales.
 */

import enMessages from './locales/en.json';
import koMessages from './locales/ko.json';

type Locale = 'en' | 'ko';

let currentLocale: Locale = 'en';

const locales: Record<Locale, Record<string, string>> = {
  en: enMessages as Record<string, string>,
  ko: koMessages as Record<string, string>,
};

export function setLocale(lang: Locale): void {
  currentLocale = lang;
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Translate a key, with optional parameter interpolation.
 * Falls back to English if the key is missing in the current locale.
 * Falls back to the key itself if missing in English too.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let text = locales[currentLocale]?.[key] ?? locales.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/**
 * Detect locale from environment.
 * Priority: CODEAGORA_LANG env var → system LANG → fallback 'en'.
 */
export function detectLocale(): Locale {
  const envLang = process.env['CODEAGORA_LANG'];
  if (envLang === 'ko' || envLang === 'en') return envLang;
  const sysLang = process.env['LANG'] ?? process.env['LANGUAGE'] ?? '';
  if (sysLang.startsWith('ko')) return 'ko';
  return 'en';
}
