/**
 * Package-level tests for packages/shared/src/i18n/index.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { t, setLocale, getLocale, detectLocale } from '@codeagora/shared/i18n/index.js';
beforeEach(() => {
    setLocale('en');
});
afterEach(() => {
    setLocale('en');
    delete process.env['CODEAGORA_LANG'];
    delete process.env['LANG'];
    delete process.env['LANGUAGE'];
});
describe('setLocale / getLocale', () => {
    it('defaults to en', () => {
        expect(getLocale()).toBe('en');
    });
    it('setLocale(ko) is reflected by getLocale', () => {
        setLocale('ko');
        expect(getLocale()).toBe('ko');
    });
    it('switching back to en works', () => {
        setLocale('ko');
        setLocale('en');
        expect(getLocale()).toBe('en');
    });
});
describe('t() — translation', () => {
    it('returns English string for a known key', () => {
        expect(t('app.title')).toBe('CodeAgora');
    });
    it('returns Korean string after setLocale(ko)', () => {
        setLocale('ko');
        expect(t('app.title')).toBe('CodeAgora'); // same in both locales
        expect(t('app.subtitle')).toBe('멀티 LLM 코드 리뷰');
    });
    it('returns key itself as fallback for unknown key', () => {
        const key = 'no.such.key.xyz';
        expect(t(key)).toBe(key);
    });
    it('interpolates a single param', () => {
        const result = t('review.failed', { error: 'timeout' });
        expect(result).toContain('timeout');
    });
    it('interpolates multiple params', () => {
        const result = t('review.session', { date: '2026-03-21', sessionId: '007' });
        expect(result).toBe('Session: 2026-03-21/007');
    });
    it('leaves other placeholders intact when a param is missing', () => {
        const result = t('review.session', { date: '2026-03-21' }); // sessionId missing
        expect(result).toContain('2026-03-21');
        expect(result).toContain('{sessionId}');
    });
    it('falls back to English when a key is missing in ko', () => {
        setLocale('ko');
        // app.title exists in both; accessing it returns a value (not the key)
        const val = t('app.title');
        expect(val).not.toBe('app.title');
    });
});
describe('detectLocale()', () => {
    it('returns ko when CODEAGORA_LANG=ko', () => {
        process.env['CODEAGORA_LANG'] = 'ko';
        expect(detectLocale()).toBe('ko');
    });
    it('returns en when CODEAGORA_LANG=en', () => {
        process.env['CODEAGORA_LANG'] = 'en';
        expect(detectLocale()).toBe('en');
    });
    it('ignores invalid CODEAGORA_LANG value and checks LANG', () => {
        process.env['CODEAGORA_LANG'] = 'fr'; // not a valid locale
        delete process.env['LANG'];
        delete process.env['LANGUAGE'];
        expect(detectLocale()).toBe('en');
    });
    it('returns ko when LANG starts with ko', () => {
        delete process.env['CODEAGORA_LANG'];
        process.env['LANG'] = 'ko_KR.UTF-8';
        expect(detectLocale()).toBe('ko');
    });
    it('returns en when LANG is something else (e.g. fr)', () => {
        delete process.env['CODEAGORA_LANG'];
        process.env['LANG'] = 'fr_FR.UTF-8';
        expect(detectLocale()).toBe('en');
    });
    it('returns en when no env vars set', () => {
        delete process.env['CODEAGORA_LANG'];
        delete process.env['LANG'];
        delete process.env['LANGUAGE'];
        expect(detectLocale()).toBe('en');
    });
});
