/**
 * Tests for config not found error message
 * Issue #79: suggest agora init when config file is not found
 */

import { describe, it, expect } from 'vitest';
import { loadConfigFrom } from '@codeagora/core/config/loader.js';
import os from 'os';
import path from 'path';

describe('Config not found', () => {
  it('suggests agora init when config file is missing', async () => {
    const emptyDir = path.join(os.tmpdir(), `no-config-${Date.now()}`);
    await expect(loadConfigFrom(emptyDir)).rejects.toThrow('agora init');
  });
});
