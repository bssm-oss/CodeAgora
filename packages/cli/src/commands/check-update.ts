/**
 * Check-Update Command
 * Check for newer version on npm.
 */

import type { Command } from 'commander';

export function registerCheckUpdateCommand(program: Command): void {
  program
    .command('check-update')
    .description('Check for newer version on npm')
    .action(async () => {
      const current = process.env.CODEAGORA_VERSION ?? 'dev';
      console.log(`Current: v${current}`);
      try {
        const res = await fetch('https://registry.npmjs.org/codeagora/latest');
        if (res.ok) {
          const data = await res.json() as { version: string };
          if (data.version !== current) {
            console.log(`Latest:  v${data.version}`);
            console.log(`\nUpdate:  npm i -g codeagora@latest`);
          } else {
            console.log('Already up to date.');
          }
        }
      } catch {
        console.log('Could not check npm registry.');
      }
    });
}
