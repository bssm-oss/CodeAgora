import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import { Command } from 'commander';
import { registerReviewCommand } from '@codeagora/cli/commands/review.js';

describe('CLI help ↔ docs parity', () => {
  it('every agora review option is documented in docs/for-users/CLI_REFERENCE.md', async () => {
    const program = new Command();
    registerReviewCommand(program);
    const reviewCmd = program.commands.find((c) => c.name() === 'review');
    expect(reviewCmd).toBeDefined();

    const flags: string[] = [];
    for (const opt of reviewCmd!.options) {
      // commander option.flags looks like "-v, --verbose"
      const matches = opt.flags.match(/--[a-zA-Z0-9-]+/g);
      if (matches) flags.push(...matches.map((s) => s.trim()));
    }

    // Ensure we discovered at least one flag
    expect(flags.length).toBeGreaterThan(0);

    const docs = await fs.readFile('docs/for-users/CLI_REFERENCE.md', 'utf-8');

    const missing = flags.filter((f) => !docs.includes(f));
    // If any flags are missing from the docs, surface them in a helpful message
    expect(missing, `The following review flags are not documented in docs/for-users/CLI_REFERENCE.md: ${missing.join(', ')}`).toHaveLength(0);
  });
});
