#!/usr/bin/env node

const { readFileSync } = require('fs');
const { join } = require('path');

const reset = '\x1b[0m';
const bold = '\x1b[1m';
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const dim = '\x1b[2m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';

let version = '2.0.0-rc.1';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  version = pkg.version;
} catch {}

const isRC = version.includes('rc');

console.log('');
console.log(`  ${cyan}${bold}CodeAgora${reset} ${dim}v${version}${isRC ? ` ${red}${bold}(Release Candidate)${reset}` : ''}${reset}`);
console.log(`  ${dim}Multi-LLM collaborative code review${reset}`);
console.log('');
console.log(`  ${green}Get started:${reset}`);
console.log(`    ${bold}$ agora init${reset}         ${dim}Auto-detect providers & setup config${reset}`);
console.log(`    ${bold}$ agora review${reset}       ${dim}Run your first code review${reset}`);
console.log(`    ${bold}$ agora language${reset}     ${dim}Switch language (en/ko)${reset}`);
console.log('');
console.log(`  ${yellow}Free tier:${reset} ${dim}Groq + GitHub Models = unlimited free reviews${reset}`);
console.log('');
console.log(`  ${cyan}Integrations:${reset}`);
console.log(`    ${dim}npm i -g @codeagora/mcp${reset}   ${dim}→ Claude Code / Cursor${reset}`);
console.log(`    ${dim}GitHub Action${reset}              ${dim}→ automated PR reviews${reset}`);
console.log(`    ${dim}Desktop app${reset}                ${dim}→ local human UI (scaffold)${reset}`);
console.log('');
console.log(`  ${dim}Docs: https://github.com/bssm-oss/CodeAgora${reset}`);
console.log('');
