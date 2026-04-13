/**
 * Persona management commands
 * agora persona list — show all available personas
 * agora persona show <name> — display persona prompt
 */

import fs from 'fs/promises';
import path from 'path';
import { bold, dim } from '../utils/colors.js';

// Built-in personas with descriptions
const BUILTIN_PERSONAS: Array<{ name: string; description: string }> = [
  { name: 'builtin:security', description: 'OWASP-focused vulnerability scanner' },
  { name: 'builtin:logic', description: 'Race conditions, null checks, off-by-one errors' },
  { name: 'builtin:api-contract', description: 'Breaking changes, backward compatibility' },
  { name: 'builtin:general', description: 'Maintainability, complexity, duplication' },
];

export async function listPersonas(baseDir: string): Promise<string> {
  const lines: string[] = [];

  lines.push(bold('Built-in Personas:'));
  for (const p of BUILTIN_PERSONAS) {
    lines.push(`  ${p.name.padEnd(24)} ${dim(p.description)}`);
  }

  // Check for custom personas in .ca/personas/
  const personasDir = path.join(baseDir, '.ca', 'personas');
  try {
    const files = await fs.readdir(personasDir);
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    if (mdFiles.length > 0) {
      lines.push('');
      lines.push(bold('Custom Personas:'));
      for (const f of mdFiles) {
        const name = f.replace(/\.md$/, '');
        lines.push(`  custom:${name.padEnd(20)} ${dim(`.ca/personas/${f}`)}`);
      }
    }
  } catch {
    // No personas directory
  }

  lines.push('');
  lines.push(dim('Create custom: agora persona create <name>'));
  lines.push(dim('Use in review: agora review --persona builtin:security'));

  return lines.join('\n');
}

export async function showPersona(name: string): Promise<string> {
  if (name.startsWith('builtin:')) {
    const key = name.replace('builtin:', '');
    const { getBuiltinPersona } = await import('@codeagora/core/l1/builtin-personas.js');
    const prompt = getBuiltinPersona(key);
    return prompt ?? `Persona '${name}' not found.`;
  }

  // Custom persona
  const cleanName = name.replace('custom:', '');
  const filePath = path.join(process.cwd(), '.ca', 'personas', `${cleanName}.md`);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return `Persona file not found: ${filePath}`;
  }
}

export async function createPersona(name: string, baseDir: string): Promise<string> {
  const personasDir = path.join(baseDir, '.ca', 'personas');
  await fs.mkdir(personasDir, { recursive: true });

  const filePath = path.join(personasDir, `${name}.md`);
  const template = `You are a ${name} specialist code reviewer.

ONLY review for:
- [Add your focus areas here]

DO NOT review for:
- Code style, naming, formatting
- Issues outside your specialty

If you find no issues in your specialty, write "No issues found."
`;

  await fs.writeFile(filePath, template, 'utf-8');
  return `Created: ${filePath}\nEdit this file to customize the persona prompt.`;
}
