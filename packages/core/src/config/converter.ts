/**
 * Config Format Converter
 * JSON ↔ YAML conversion utilities for CodeAgora config files.
 */

import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

// ============================================================================
// Types
// ============================================================================

export interface ConversionResult {
  content: string;
  format: 'json' | 'yaml';
  warnings: string[];
}

// ============================================================================
// JSON → YAML
// ============================================================================

/**
 * Convert a JSON string to a YAML string.
 * Inserts a comment header describing the output format.
 */
export function jsonToYaml(jsonContent: string): ConversionResult {
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`JSON parse error: ${msg}`);
  }

  const yamlBody = yamlStringify(parsed, { lineWidth: 120 });
  const content = `# CodeAgora Configuration\n# Generated from JSON\n\n${yamlBody}`;

  return { content, format: 'yaml', warnings };
}

// ============================================================================
// YAML → JSON
// ============================================================================

/**
 * Convert a YAML string to a JSON string (2-space indented).
 */
export function yamlToJson(yamlContent: string): ConversionResult {
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = yamlParse(yamlContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`YAML parse error: ${msg}`);
  }

  const content = JSON.stringify(parsed, null, 2);

  return { content, format: 'json', warnings };
}

// ============================================================================
// Config object → annotated YAML
// ============================================================================

/**
 * Serialize an arbitrary config object to a YAML string with a comment header.
 */
export function configToYaml(config: object): string {
  const body = yamlStringify(config, { lineWidth: 120 });
  return `# CodeAgora Configuration\n# Edit this file to configure your review pipeline.\n\n${body}`;
}
