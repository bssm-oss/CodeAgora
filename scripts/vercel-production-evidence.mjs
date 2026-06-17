#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, URL } from 'node:url';

export const VERCEL_PRODUCTION_EVIDENCE_SCHEMA_VERSION = 'codeagora.vercel-production-evidence.v1';

const DEFAULT_URL = 'https://codeagora.vercel.app/';
const REQUIRED_HTML_MARKERS = [
  'data-codeagora-site="astro"',
  '<meta name="application-name" content="CodeAgora">',
  'CodeAgora',
  'GitHub Action',
  'MCP',
  'Desktop',
  '/assets/codeagora-icon.png',
  '/assets/codeagora-wordmark.png',
  '/assets/social-card.svg',
];

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    expectedSha: process.env.CODEAGORA_STABLE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    evidenceDir: path.join('.sisyphus', 'evidence'),
    output: null,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--url') {
      options.url = argv[++index];
    } else if (arg?.startsWith('--url=')) {
      options.url = arg.slice('--url='.length);
    } else if (arg === '--expected-sha') {
      options.expectedSha = argv[++index];
    } else if (arg?.startsWith('--expected-sha=')) {
      options.expectedSha = arg.slice('--expected-sha='.length);
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = argv[++index];
    } else if (arg?.startsWith('--evidence-dir=')) {
      options.evidenceDir = arg.slice('--evidence-dir='.length);
    } else if (arg === '--output') {
      options.output = argv[++index];
    } else if (arg?.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.expectedSha) {
    options.expectedSha = currentCommitSha();
  }

  return options;
}

function currentCommitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function resolveUrl(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString();
}

async function fetchText(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable; run with Node 20 or newer.');
  }

  const response = await fetchImpl(url, {
    headers: {
      'user-agent': 'CodeAgora stable readiness evidence',
    },
  });
  const body = await response.text();
  return {
    url,
    status: response.status,
    ok: response.ok,
    contentType: response.headers?.get?.('content-type') ?? null,
    body,
    sha256: sha256(body),
    sizeBytes: Buffer.byteLength(body),
  };
}

function extractCommitSha(html) {
  const metaMatch = html.match(/<meta\s+name="codeagora:commit"\s+content="([^"]+)"/i);
  if (metaMatch) {
    return metaMatch[1];
  }

  const dataMatch = html.match(/data-codeagora-commit="([^"]+)"/i);
  return dataMatch?.[1] ?? null;
}

function validateProductionResponses({ html, robots, sitemap, icon, wordmark, socialCard, expectedSha }) {
  const errors = [];

  for (const entry of [html, robots, sitemap, icon, wordmark, socialCard]) {
    if (!entry.ok) {
      errors.push(`${entry.url} returned HTTP ${entry.status}`);
    }
  }

  for (const marker of REQUIRED_HTML_MARKERS) {
    if (!html.body.includes(marker)) {
      errors.push(`Production HTML is missing marker: ${marker}`);
    }
  }

  const deployedSha = extractCommitSha(html.body);
  if (!deployedSha) {
    errors.push('Production HTML is missing codeagora:commit metadata.');
  } else if (expectedSha !== 'unknown' && deployedSha !== expectedSha) {
    errors.push(`Production HTML commit ${deployedSha} does not match expected stable SHA ${expectedSha}.`);
  }

  if (!robots.body.includes('Sitemap: https://codeagora.vercel.app/sitemap.xml')) {
    errors.push('robots.txt is missing the canonical sitemap URL.');
  }
  if (!sitemap.body.includes('<loc>https://codeagora.vercel.app/</loc>')) {
    errors.push('sitemap.xml is missing the canonical landing URL.');
  }
  if (!socialCard.body.includes('CodeAgora')) {
    errors.push('social-card.svg is missing CodeAgora brand text.');
  }
  if (icon.sizeBytes <= 1000) {
    errors.push('codeagora-icon.png is unexpectedly small.');
  }
  if (wordmark.sizeBytes <= 1000) {
    errors.push('codeagora-wordmark.png is unexpectedly small.');
  }

  return {
    valid: errors.length === 0,
    errors,
    deployedSha,
  };
}

export async function buildVercelProductionEvidence(options = {}) {
  const url = options.url ?? DEFAULT_URL;
  const expectedSha = options.expectedSha ?? currentCommitSha();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const [html, robots, sitemap, icon, wordmark, socialCard] = await Promise.all([
    fetchText(url, fetchImpl),
    fetchText(resolveUrl(url, '/robots.txt'), fetchImpl),
    fetchText(resolveUrl(url, '/sitemap.xml'), fetchImpl),
    fetchText(resolveUrl(url, '/assets/codeagora-icon.png'), fetchImpl),
    fetchText(resolveUrl(url, '/assets/codeagora-wordmark.png'), fetchImpl),
    fetchText(resolveUrl(url, '/assets/social-card.svg'), fetchImpl),
  ]);
  const validation = validateProductionResponses({
    html,
    robots,
    sitemap,
    icon,
    wordmark,
    socialCard,
    expectedSha,
  });

  return {
    schemaVersion: VERCEL_PRODUCTION_EVIDENCE_SCHEMA_VERSION,
    evidenceMode: validation.valid ? 'real' : 'failed',
    releaseTier: 'stable',
    generatedAt: new Date().toISOString(),
    productionUrl: url,
    expectedSha,
    deployedSha: validation.deployedSha,
    passed: validation.valid,
    checks: {
      productionHtml200: html.ok,
      astroLandingMarkers: REQUIRED_HTML_MARKERS.every((marker) => html.body.includes(marker)),
      commitMetadataMatches: validation.deployedSha === expectedSha || expectedSha === 'unknown',
      robotsTxt: robots.ok && robots.body.includes('Sitemap: https://codeagora.vercel.app/sitemap.xml'),
      sitemapXml: sitemap.ok && sitemap.body.includes('<loc>https://codeagora.vercel.app/</loc>'),
      brandAssets: icon.ok && wordmark.ok && socialCard.ok && icon.sizeBytes > 1000 && wordmark.sizeBytes > 1000,
    },
    errors: validation.errors,
    responses: {
      html: responseSummary(html),
      robots: responseSummary(robots),
      sitemap: responseSummary(sitemap),
      icon: responseSummary(icon),
      wordmark: responseSummary(wordmark),
      socialCard: responseSummary(socialCard),
    },
  };
}

function responseSummary(entry) {
  return {
    url: entry.url,
    status: entry.status,
    ok: entry.ok,
    contentType: entry.contentType,
    sizeBytes: entry.sizeBytes,
    sha256: entry.sha256,
  };
}

export async function writeVercelProductionEvidence(options = {}) {
  const evidence = await buildVercelProductionEvidence(options);
  const outputPath = path.resolve(
    options.output ?? path.join(options.evidenceDir ?? path.join('.sisyphus', 'evidence'), 'vercel-production-evidence.json'),
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);

  return {
    evidence,
    outputPath,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { evidence, outputPath } = await writeVercelProductionEvidence(options);
  if (!evidence.passed) {
    throw new Error(`Vercel production evidence failed: ${evidence.errors.join('; ')}`);
  }
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
