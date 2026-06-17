import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildVercelProductionEvidence,
  writeVercelProductionEvidence,
} from '../../scripts/vercel-production-evidence.mjs';

const expectedSha = 'a'.repeat(40);
const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta name="application-name" content="CodeAgora">
    <meta name="codeagora:commit" content="${expectedSha}">
  </head>
  <body data-codeagora-site="astro" data-codeagora-commit="${expectedSha}">
    CodeAgora GitHub Action MCP Desktop
    <img src="/assets/codeagora-icon.png">
    <img src="/assets/codeagora-wordmark.png">
    <img src="/assets/social-card.png">
  </body>
</html>`;

function makeFetch(overrides: Record<string, string> = {}) {
  return async (url: string) => {
    const pathname = new URL(url).pathname;
    const body = overrides[pathname] ?? {
      '/': html,
      '/robots.txt': 'User-agent: *\nAllow: /\nSitemap: https://codeagora.vercel.app/sitemap.xml\n',
      '/sitemap.xml': '<urlset><url><loc>https://codeagora.vercel.app/</loc></url></urlset>\n',
      '/assets/codeagora-icon.png': 'x'.repeat(1200),
      '/assets/codeagora-wordmark.png': 'x'.repeat(1200),
      '/assets/social-card.png': 'x'.repeat(1200),
    }[pathname];

    return {
      ok: true,
      status: 200,
      headers: {
        get: () => pathname.endsWith('.png') ? 'image/png' : 'text/plain',
      },
      text: async () => body ?? '',
    };
  };
}

describe('Vercel production evidence', () => {
  it('accepts production HTML with Astro markers and matching commit metadata', async () => {
    const evidence = await buildVercelProductionEvidence({
      url: 'https://codeagora.vercel.app/',
      expectedSha,
      fetchImpl: makeFetch(),
    });

    expect(evidence).toMatchObject({
      schemaVersion: 'codeagora.vercel-production-evidence.v1',
      evidenceMode: 'real',
      releaseTier: 'stable',
      expectedSha,
      deployedSha: expectedSha,
      passed: true,
      checks: {
        productionHtml200: true,
        astroLandingMarkers: true,
        commitMetadataMatches: true,
        robotsTxt: true,
        sitemapXml: true,
        brandAssets: true,
      },
      errors: [],
    });
  });

  it('writes failed evidence when production serves the wrong commit', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeagora-vercel-evidence-'));
    const staleSha = 'b'.repeat(40);
    try {
      const { evidence, outputPath } = await writeVercelProductionEvidence({
        url: 'https://codeagora.vercel.app/',
        expectedSha,
        evidenceDir: dir,
        fetchImpl: makeFetch({
          '/': html.replaceAll(expectedSha, staleSha),
        }),
      });

      expect(outputPath).toBe(path.join(dir, 'vercel-production-evidence.json'));
      expect(evidence).toMatchObject({
        evidenceMode: 'failed',
        passed: false,
        deployedSha: staleSha,
      });
      expect(evidence.errors.join('\n')).toContain(`does not match expected stable SHA ${expectedSha}`);
      expect(JSON.parse(fs.readFileSync(outputPath, 'utf-8'))).toEqual(evidence);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
