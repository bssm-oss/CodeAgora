/**
 * Language Command
 * Get or set the UI language (en/ko).
 */

import type { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { loadConfig } from '@codeagora/core/config/loader.js';
import { setLocale, detectLocale, t } from '@codeagora/shared/i18n/index.js';

export function registerLanguageCommand(program: Command, displayName: string): void {
  program
    .command('language [locale]')
    .description('Get or set language (en/ko)')
    .action(async (locale?: string) => {
      const caRoot = path.join(process.cwd(), '.ca');

      if (!locale) {
        // Show current language
        try {
          const config = await loadConfig();
          const lang = config.language ?? detectLocale();
          console.log(`Current language: ${lang === 'ko' ? 'ko (한국어)' : 'en (English)'}`);
          console.log(`\nUsage: ${displayName} language <en|ko>`);
        } catch {
          const lang = detectLocale();
          console.log(`No config found. System locale: ${lang === 'ko' ? 'ko (한국어)' : 'en (English)'}`);
          console.log(`\nRun "${displayName} init" first, then "${displayName} language <en|ko>"`);
        }
        return;
      }

      if (locale !== 'en' && locale !== 'ko') {
        console.error(t('cli.error.unsupportedLanguage', { locale }));
        process.exit(1);
      }

      // Update config file
      const jsonPath = path.join(caRoot, 'config.json');
      const yamlPath = path.join(caRoot, 'config.yaml');

      let configPath: string | null = null;
      try { await fs.access(jsonPath); configPath = jsonPath; } catch { /* */ }
      if (!configPath) {
        try { await fs.access(yamlPath); configPath = yamlPath; } catch { /* */ }
      }

      if (!configPath) {
        console.error(t('cli.error.runInitFirst', { cmd: displayName }));
        process.exit(1);
      }

      if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
        console.error(t('cli.error.yamlNotSupported'));
        process.exit(1);
      }

      const raw = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(raw);
      config.language = locale;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

      setLocale(locale);
      console.log(locale === 'ko'
        ? `✓ 언어가 한국어(ko)로 설정되었습니다.`
        : `✓ Language set to English (en).`
      );
    });
}
