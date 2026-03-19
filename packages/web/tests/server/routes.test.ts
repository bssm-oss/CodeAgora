/**
 * API Route Tests
 * Tests each route using Hono's app.request() method with mocked file system.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { healthRoutes } from '../../src/server/routes/health.js';
import { sessionRoutes } from '../../src/server/routes/sessions.js';
import { modelRoutes } from '../../src/server/routes/models.js';
import { configRoutes } from '../../src/server/routes/config.js';
import { costRoutes } from '../../src/server/routes/costs.js';

// ============================================================================
// Mock fs/promises
// ============================================================================

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

import { readdir, readFile, writeFile } from 'fs/promises';

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

// ============================================================================
// Test Data
// ============================================================================

const sampleMetadata = {
  sessionId: '001',
  date: '2025-01-15',
  timestamp: 1705312800000,
  diffPath: 'test.diff',
  status: 'completed',
  startedAt: 1705312800000,
  completedAt: 1705312900000,
};

const sampleReview = {
  reviewerId: 'r1',
  model: 'gpt-4',
  group: 'src/',
  evidenceDocs: [],
  rawResponse: 'No issues found',
  status: 'success',
};

const sampleBanditData = {
  version: 1,
  lastUpdated: '2025-01-15T00:00:00.000Z',
  arms: {
    'openai/gpt-4': { alpha: 10, beta: 2, reviewCount: 12, lastUsed: 1705312800000 },
    'anthropic/claude-3': { alpha: 8, beta: 3, reviewCount: 11, lastUsed: 1705312700000 },
  },
  history: [
    {
      reviewId: 'rev-001',
      diffId: 'diff-001',
      modelId: 'gpt-4',
      provider: 'openai',
      timestamp: 1705312800000,
      issuesRaised: 3,
      specificityScore: 0.85,
      peerValidationRate: 0.9,
      headAcceptanceRate: 0.95,
      compositeQ: 0.9,
      rewardSignal: 1,
    },
  ],
};

const sampleConfig = {
  reviewers: [
    { id: 'r1', model: 'gpt-4', backend: 'api', provider: 'openai', timeout: 120, enabled: true },
  ],
  supporters: {
    pool: [
      { id: 's1', model: 'gpt-4', backend: 'api', provider: 'openai', timeout: 120, enabled: true },
    ],
    pickCount: 2,
    pickStrategy: 'random',
    devilsAdvocate: { id: 'da1', model: 'gpt-4', backend: 'api', provider: 'openai', timeout: 120, enabled: true },
    personaPool: ['critic', 'optimist'],
    personaAssignment: 'random',
  },
  moderator: { backend: 'api', model: 'gpt-4', provider: 'openai' },
  discussion: {
    maxRounds: 3,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null,
    },
    codeSnippetRange: 10,
  },
  errorHandling: { maxRetries: 2, forfeitThreshold: 0.7 },
};

const sampleReport = {
  costs: {
    total: 0.1234,
    byReviewer: { r1: 0.05, r2: 0.07 },
    byLayer: { l1: 0.08, l2: 0.03, l3: 0.01 },
  },
};

// ============================================================================
// Health Route Tests
// ============================================================================

describe('GET /api/health', () => {
  it('should return status ok with version and uptime', async () => {
    const app = new Hono();
    app.route('/api/health', healthRoutes);

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('2.0.0');
    expect(typeof body.uptime).toBe('number');
  });
});

// ============================================================================
// Session Route Tests
// ============================================================================

describe('Session Routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET /api/sessions should return session list', async () => {
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    mockReaddir.mockImplementation(async (dirPath: unknown) => {
      const p = String(dirPath);
      if (p.endsWith('sessions')) return ['2025-01-15'] as unknown as ReturnType<typeof readdir>;
      if (p.endsWith('2025-01-15')) return ['001'] as unknown as ReturnType<typeof readdir>;
      return [] as unknown as ReturnType<typeof readdir>;
    });

    mockReadFile.mockResolvedValue(JSON.stringify(sampleMetadata));

    const res = await app.request('/api/sessions');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].sessionId).toBe('001');
    expect(body[0].date).toBe('2025-01-15');
  });

  it('GET /api/sessions should return empty array when no sessions exist', async () => {
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const res = await app.request('/api/sessions');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('GET /api/sessions/:date/:id should return session detail', async () => {
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    mockReadFile.mockImplementation(async (filePath: unknown) => {
      const p = String(filePath);
      if (p.includes('metadata.json')) return JSON.stringify(sampleMetadata);
      if (p.includes('verdict.json')) return JSON.stringify({ decision: 'ACCEPT' });
      return '{}';
    });

    mockReaddir.mockResolvedValue([] as unknown as ReturnType<typeof readdir>);

    const res = await app.request('/api/sessions/2025-01-15/001');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.metadata.sessionId).toBe('001');
    expect(body.verdict.decision).toBe('ACCEPT');
  });

  it('GET /api/sessions/:date/:id should return 404 for missing session', async () => {
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const res = await app.request('/api/sessions/2025-01-15/999');
    expect(res.status).toBe(404);
  });

  it('GET /api/sessions/:date/:id should return 400 for invalid identifier', async () => {
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    const res = await app.request('/api/sessions/bad-date/abc');
    expect(res.status).toBe(400);
  });

  it('GET /api/sessions/:date/:id/reviews should return reviews', async () => {
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    mockReaddir.mockResolvedValue(['r1.json'] as unknown as ReturnType<typeof readdir>);
    mockReadFile.mockResolvedValue(JSON.stringify(sampleReview));

    const res = await app.request('/api/sessions/2025-01-15/001/reviews');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].reviewerId).toBe('r1');
  });

  it('GET /api/sessions/:date/:id/verdict should return 404 when no verdict', async () => {
    const app = new Hono();
    app.route('/api/sessions', sessionRoutes);

    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const res = await app.request('/api/sessions/2025-01-15/001/verdict');
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// Model Route Tests
// ============================================================================

describe('Model Routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET /api/models should return arms with win rates', async () => {
    const app = new Hono();
    app.route('/api/models', modelRoutes);

    mockReadFile.mockResolvedValue(JSON.stringify(sampleBanditData));

    const res = await app.request('/api/models');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.arms).toHaveLength(2);
    expect(body.status).toBe('ok');

    const gpt4Arm = body.arms.find((a: Record<string, unknown>) => a.modelId === 'openai/gpt-4');
    expect(gpt4Arm).toBeDefined();
    // winRate = alpha / (alpha + beta) = 10 / 12
    expect(gpt4Arm.winRate).toBeCloseTo(10 / 12, 4);
  });

  it('GET /api/models should return no_data when file missing', async () => {
    const app = new Hono();
    app.route('/api/models', modelRoutes);

    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const res = await app.request('/api/models');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('no_data');
    expect(body.arms).toEqual([]);
  });

  it('GET /api/models/history should return review history', async () => {
    const app = new Hono();
    app.route('/api/models', modelRoutes);

    mockReadFile.mockResolvedValue(JSON.stringify(sampleBanditData));

    const res = await app.request('/api/models/history');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.history).toHaveLength(1);
    expect(body.history[0].reviewId).toBe('rev-001');
  });
});

// ============================================================================
// Config Route Tests
// ============================================================================

describe('Config Routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET /api/config should return config', async () => {
    const app = new Hono();
    app.route('/api/config', configRoutes);

    mockReadFile.mockResolvedValue(JSON.stringify(sampleConfig));

    const res = await app.request('/api/config');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.moderator.model).toBe('gpt-4');
  });

  it('GET /api/config should return 404 when no config', async () => {
    const app = new Hono();
    app.route('/api/config', configRoutes);

    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const res = await app.request('/api/config');
    expect(res.status).toBe(404);
  });

  it('PUT /api/config should validate and save valid config', async () => {
    const app = new Hono();
    app.route('/api/config', configRoutes);

    // First readFile call for getExistingConfigPath
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockWriteFile.mockResolvedValue(undefined);

    const res = await app.request('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleConfig),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('saved');
  });

  it('PUT /api/config should reject invalid config', async () => {
    const app = new Hono();
    app.route('/api/config', configRoutes);

    const res = await app.request('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: true }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid configuration');
  });
});

// ============================================================================
// Cost Route Tests
// ============================================================================

describe('Cost Routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET /api/costs should return aggregated cost data', async () => {
    const app = new Hono();
    app.route('/api/costs', costRoutes);

    mockReaddir.mockImplementation(async (dirPath: unknown) => {
      const p = String(dirPath);
      if (p.endsWith('sessions')) return ['2025-01-15'] as unknown as ReturnType<typeof readdir>;
      if (p.endsWith('2025-01-15')) return ['001'] as unknown as ReturnType<typeof readdir>;
      return [] as unknown as ReturnType<typeof readdir>;
    });

    mockReadFile.mockResolvedValue(JSON.stringify(sampleReport));

    const res = await app.request('/api/costs');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalCost).toBeCloseTo(0.1234, 4);
    expect(body.sessionCount).toBe(1);
    expect(body.perReviewerCosts.r1).toBeCloseTo(0.05);
    expect(body.perLayerCosts.l1).toBeCloseTo(0.08);
  });

  it('GET /api/costs should return zeros when no sessions', async () => {
    const app = new Hono();
    app.route('/api/costs', costRoutes);

    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const res = await app.request('/api/costs');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalCost).toBe(0);
    expect(body.sessionCount).toBe(0);
  });

  it('GET /api/costs/pricing should return pricing data', async () => {
    const app = new Hono();
    app.route('/api/costs', costRoutes);

    const pricingData = { 'openai/gpt-4': { input: 0.03, output: 0.06 } };
    mockReadFile.mockResolvedValue(JSON.stringify(pricingData));

    const res = await app.request('/api/costs/pricing');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body['openai/gpt-4'].input).toBe(0.03);
  });
});
