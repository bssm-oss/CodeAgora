/**
 * Config-Get Command
 * Get a config value by dot notation key, or show full config.
 */

import type { Command } from 'commander';
import { loadConfig } from '@codeagora/core/config/loader.js';

export function registerConfigGetCommand(program: Command): void {
  program
    .command('config-get [key]')
    .description('Get a config value by dot notation key (or full config if no key)')
    .action(async (key?: string) => {
      try {
        const config = await loadConfig();
        if (!key) {
          console.log(JSON.stringify(config, null, 2));
          return;
        }
        const parts = key.split('.');
        let current: unknown = config;
        for (const part of parts) {
          if (current == null || typeof current !== 'object') {
            console.error(`Key "${key}" not found in config`);
            process.exit(1);
          }
          current = (current as Record<string, unknown>)[part];
        }
        if (current === undefined) {
          console.error(`Key "${key}" not found in config`);
          process.exit(1);
        }
        if (typeof current === 'object') {
          console.log(JSON.stringify(current, null, 2));
        } else {
          console.log(String(current));
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
