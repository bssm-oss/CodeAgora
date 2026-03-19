#!/usr/bin/env tsx
/**
 * Test Runner for V3 Pipeline
 * Usage: tsx run-test.ts [path-to-diff]
 */

import { runPipeline } from '@codeagora/core/pipeline/orchestrator.js';
import path from 'path';

const diffPath = process.argv[2] || '../test-pr.diff';
const absoluteDiffPath = path.resolve(diffPath);

console.log('🚀 CodeAgora V3 Test Runner');
console.log('═'.repeat(50));
console.log(`📄 Diff: ${absoluteDiffPath}`);
console.log('═'.repeat(50));
console.log('');

async function main() {
  const startTime = Date.now();

  try {
    const result = await runPipeline({ diffPath: absoluteDiffPath });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log('═'.repeat(50));
    console.log('✅ Pipeline Result');
    console.log('═'.repeat(50));
    console.log(`Status: ${result.status}`);
    console.log(`Session ID: ${result.sessionId}`);
    console.log(`Date: ${result.date}`);
    console.log(`Duration: ${duration}s`);

    if (result.status === 'error') {
      console.log(`❌ Error: ${result.error}`);
      process.exit(1);
    }

    console.log('');
    console.log(`📂 Session Directory: .ca/sessions/${result.date}/${result.sessionId}`);
    console.log(`📝 Check report.md and result.md for details`);
    console.log('');
  } catch (error) {
    console.error('❌ Fatal Error:', error);
    process.exit(1);
  }
}

main();
