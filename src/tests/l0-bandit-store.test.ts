import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BanditStore } from '@codeagora/core/l0/bandit-store.js';
import { unlink, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'codeagora-test-bandit');
const TEST_PATH = path.join(TEST_DIR, 'model-quality.json');

describe('BanditStore', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await unlink(TEST_PATH);
    } catch {
      // ignore
    }
  });

  it('should initialize with empty state', () => {
    const store = new BanditStore(TEST_PATH);
    const data = store.getData();

    expect(data.version).toBe(1);
    expect(data.arms).toEqual({});
    expect(data.history).toEqual([]);
  });

  it('should update arm with reward=1 (alpha increases)', () => {
    const store = new BanditStore(TEST_PATH);
    store.updateArm('groq/llama-3.3-70b', 1);

    const arm = store.getArm('groq/llama-3.3-70b');
    expect(arm).toBeDefined();
    expect(arm!.alpha).toBe(2); // 1 (default) + 1
    expect(arm!.beta).toBe(1); // unchanged
    expect(arm!.reviewCount).toBe(1);
  });

  it('should update arm with reward=0 (beta increases)', () => {
    const store = new BanditStore(TEST_PATH);
    store.updateArm('groq/llama-3.3-70b', 0);

    const arm = store.getArm('groq/llama-3.3-70b');
    expect(arm!.alpha).toBe(1); // unchanged
    expect(arm!.beta).toBe(2); // 1 (default) + 1
    expect(arm!.reviewCount).toBe(1);
  });

  it('should accumulate multiple updates', () => {
    const store = new BanditStore(TEST_PATH);
    store.updateArm('groq/llama-3.3-70b', 1);
    store.updateArm('groq/llama-3.3-70b', 1);
    store.updateArm('groq/llama-3.3-70b', 0);

    const arm = store.getArm('groq/llama-3.3-70b');
    expect(arm!.alpha).toBe(3); // 1 + 2
    expect(arm!.beta).toBe(2); // 1 + 1
    expect(arm!.reviewCount).toBe(3);
  });

  it('should save and load round-trip correctly', async () => {
    const store = new BanditStore(TEST_PATH);
    store.updateArm('groq/llama-3.3-70b', 1);
    store.updateArm('nim/deepseek-r1', 0);
    store.addHistory({
      reviewId: 'r1',
      diffId: 'session-001',
      modelId: 'llama-3.3-70b',
      provider: 'groq',
      timestamp: Date.now(),
      issuesRaised: 3,
      specificityScore: 0.8,
      peerValidationRate: 0.75,
      headAcceptanceRate: 0.6,
      compositeQ: 0.593,
      rewardSignal: 1,
    });
    await store.save();

    // Load into new instance
    const loaded = new BanditStore(TEST_PATH);
    await loaded.load();

    const arm1 = loaded.getArm('groq/llama-3.3-70b');
    expect(arm1!.alpha).toBe(2);
    expect(arm1!.beta).toBe(1);

    const arm2 = loaded.getArm('nim/deepseek-r1');
    expect(arm2!.alpha).toBe(1);
    expect(arm2!.beta).toBe(2);

    const history = loaded.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].reviewId).toBe('r1');
    expect(history[0].compositeQ).toBe(0.593);
  });

  it('should warm-start new key from old key with 50% decay', () => {
    const store = new BanditStore(TEST_PATH);

    // Build up old arm
    store.updateArm('groq/model-v1', 1);
    store.updateArm('groq/model-v1', 1);
    store.updateArm('groq/model-v1', 1);
    store.updateArm('groq/model-v1', 0);
    // alpha=4, beta=2

    store.warmStart('groq/model-v1', 'groq/model-v2');

    const newArm = store.getArm('groq/model-v2');
    expect(newArm).toBeDefined();
    expect(newArm!.alpha).toBe(Math.round(4 * 0.5) + 1); // 3
    expect(newArm!.beta).toBe(Math.round(2 * 0.5) + 1); // 2
    expect(newArm!.reviewCount).toBe(0);
  });

  it('should handle load from non-existent file gracefully', async () => {
    const store = new BanditStore(path.join(TEST_DIR, 'nonexistent.json'));
    await store.load();

    expect(store.getData().arms).toEqual({});
    expect(store.getData().history).toEqual([]);
  });

  it('should return all arms as Map', () => {
    const store = new BanditStore(TEST_PATH);
    store.updateArm('groq/a', 1);
    store.updateArm('nim/b', 0);

    const arms = store.getAllArms();
    expect(arms.size).toBe(2);
    expect(arms.get('groq/a')?.alpha).toBe(2);
    expect(arms.get('nim/b')?.beta).toBe(2);
  });
});
