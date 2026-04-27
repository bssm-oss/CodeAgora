/**
 * Help Text
 * Per-command usage examples appended via addHelpText().
 */

import type { Command } from 'commander';

export function addHelpExamples(program: Command, displayName: string): void {
  for (const cmd of program.commands) {
    const name = cmd.name();
    switch (name) {
      case 'review':
        cmd.addHelpText('after', `
Examples:
  git diff HEAD~1 | ${displayName} review          Review last commit
  ${displayName} review changes.diff               Review a diff file
  ${displayName} review --pr 123                   Review a GitHub PR
  ${displayName} review --staged                   Review staged changes
  ${displayName} review --quick                    Quick review (L1 only)
  ${displayName} review --verbose                   Show full issue details
  ${displayName} review --context-lines 40         More surrounding context
  ${displayName} review --context-lines 0          Disable context
  ${displayName} review --output json              JSON output for CI
  ${displayName} review --json-stream              Stream NDJSON for CI
  ${displayName} review --no-cache                 Skip cache, run fresh review
  ${displayName} review --output html              HTML report for sharing
  ${displayName} review --output junit             JUnit XML for CI integration
`);
        break;
      case 'init':
        cmd.addHelpText('after', `
Examples:
  ${displayName} init                              Interactive setup wizard
  ${displayName} init -y                           Use defaults (no prompts)
  ${displayName} init --format yaml                Create YAML config
  ${displayName} init --ci                         Also create GitHub Actions workflow
`);
        break;
      case 'doctor':
        cmd.addHelpText('after', `
Examples:
  ${displayName} doctor                            Check environment
  ${displayName} doctor --live                     Test actual API connections
`);
        break;
      case 'sessions':
        cmd.addHelpText('after', `
Examples:
  ${displayName} sessions list                     List recent sessions
  ${displayName} sessions list --limit 5           Show last 5 sessions
  ${displayName} sessions list --search "null"     Search sessions by keyword
  ${displayName} sessions show 2026-03-19/001      Show session details
  ${displayName} sessions diff 001 002             Compare two sessions
  ${displayName} sessions stats                    Show review statistics
`);
        break;
      case 'models':
        cmd.addHelpText('after', `
Examples:
  ${displayName} models                            Show model leaderboard
`);
        break;
      case 'costs':
        cmd.addHelpText('after', `
Examples:
  ${displayName} costs                             Show total cost summary
  ${displayName} costs --last 7                    Costs from last 7 days
  ${displayName} costs --by reviewer               Group costs by reviewer model
  ${displayName} costs --by provider               Group costs by provider
`);
        break;
      case 'learn':
        cmd.addHelpText('after', `
Examples:
  ${displayName} learn from-pr --pr 42             Learn from PR #42
  ${displayName} learn list                        Show all learned patterns
  ${displayName} learn stats                       Show pattern statistics
  ${displayName} learn remove 0                    Remove pattern at index 0
  ${displayName} learn export > patterns.json      Export patterns
  ${displayName} learn import patterns.json        Import patterns
  ${displayName} learn clear                       Clear all patterns
`);
        break;
      case 'language':
        cmd.addHelpText('after', `
Examples:
  ${displayName} language                          Show current language
  ${displayName} language en                       Set language to English
  ${displayName} language ko                       Set language to Korean
`);
        break;
      case 'status':
        cmd.addHelpText('after', `
Examples:
  ${displayName} status                            Show CodeAgora status
`);
        break;
      case 'config-get':
        cmd.addHelpText('after', `
Examples:
  ${displayName} config-get                        Show full config
  ${displayName} config-get discussion.maxRounds   Get max discussion rounds
  ${displayName} config-get language               Get language setting
`);
        break;
      case 'config-set':
        cmd.addHelpText('after', `
Examples:
  ${displayName} config-set discussion.maxRounds 5 Set max discussion rounds
  ${displayName} config-set language ko            Set language to Korean
`);
        break;
      case 'config-edit':
        cmd.addHelpText('after', `
Examples:
  ${displayName} config-edit                       Open config in editor
`);
        break;
      case 'providers-test':
        cmd.addHelpText('after', `
Examples:
  ${displayName} providers-test                    Check API key status
`);
        break;
    }
  }
}
