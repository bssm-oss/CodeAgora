import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ConfigScreen } from '@codeagora/tui/screens/ConfigScreen.js';
import type { Config } from '@codeagora/core/types/config.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('fs', () => ({
  default: {
    writeFileSync: vi.fn(),
  },
}));

const mockConfig: Config = {
  reviewers: [
    { id: 'r1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
    { id: 'r2', model: 'gemini-2.0-flash', backend: 'api', provider: 'google', enabled: false, timeout: 120 },
  ],
  supporters: {
    pool: [
      { id: 's1', model: 'llama-3.3-70b-versatile', backend: 'api', provider: 'groq', enabled: true, timeout: 120 },
    ],
    pickCount: 1,
    pickStrategy: 'random',
    devilsAdvocate: {
      id: 'da',
      model: 'llama-3.3-70b-versatile',
      backend: 'api',
      provider: 'groq',
      enabled: true,
      timeout: 120,
    },
    personaPool: ['.ca/personas/strict.md'],
    personaAssignment: 'random',
  },
  moderator: {
    model: 'llama-3.3-70b-versatile',
    backend: 'api',
    provider: 'groq',
  },
  discussion: {
    maxRounds: 4,
    registrationThreshold: {
      HARSHLY_CRITICAL: 1,
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: null,
    },
    codeSnippetRange: 10,
  },
  errorHandling: {
    maxRetries: 2,
    forfeitThreshold: 0.7,
  },
};

vi.mock('../../packages/core/src/config/loader.js', () => ({
  loadConfigFrom: vi.fn(),
}));

import { loadConfigFrom } from '@codeagora/core/config/loader.js';
const mockLoadConfigFrom = vi.mocked(loadConfigFrom);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for async state updates (useEffect + setState) to flush.
 * ink-testing-library does not expose act(), so we use a short real wait.
 */
async function waitForRender(ms = 20): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfigScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 4 tab headers', async () => {
    mockLoadConfigFrom.mockResolvedValue(mockConfig);
    const { lastFrame, unmount } = render(<ConfigScreen />);
    await waitForRender();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Reviewers');
    expect(frame).toContain('Supporters');
    expect(frame).toContain('Moderator');
    expect(frame).toContain('Presets');
    unmount();
  });

  it('shows reviewer list from mock config', async () => {
    mockLoadConfigFrom.mockResolvedValue(mockConfig);
    const { lastFrame, unmount } = render(<ConfigScreen />);
    await waitForRender();
    const frame = lastFrame() ?? '';
    // Reviewers tab is active by default — should show reviewer ids
    expect(frame).toContain('r1');
    expect(frame).toContain('r2');
    unmount();
  });

  it('shows "No config" message when config is missing', async () => {
    mockLoadConfigFrom.mockRejectedValue(new Error('Config file not found'));
    const { lastFrame, unmount } = render(<ConfigScreen />);
    await waitForRender();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('No config');
    unmount();
  });

  it('Presets tab shows preset names', async () => {
    mockLoadConfigFrom.mockResolvedValue(mockConfig);
    const { lastFrame, rerender, unmount } = render(<ConfigScreen />);
    await waitForRender();

    // We can't easily send Tab key through ink-testing-library to switch tabs,
    // so we test PresetsTab directly
    unmount();

    // Test PresetsTab in isolation
    const { PresetsTab } = await import('@codeagora/tui/screens/config/PresetsTab.js');
    const { lastFrame: presetsFrame, unmount: unmount2 } = render(
      <PresetsTab config={mockConfig} isActive={true} onConfigChange={() => {}} />
    );
    const frame = presetsFrame() ?? '';
    expect(frame).toContain('Quick Setup');
    expect(frame).toContain('Diversity');
    expect(frame).toContain('Minimal');
    unmount2();

    // suppress unused variable warning
    void rerender;
  });

  it('shows Loading while config is fetching', () => {
    // Never resolves during this test
    mockLoadConfigFrom.mockReturnValue(new Promise(() => {}));
    const { lastFrame, unmount } = render(<ConfigScreen />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Loading');
    unmount();
  });
});

describe('ReviewersTab', () => {
  it('renders reviewer ids and providers', async () => {
    const { ReviewersTab } = await import('@codeagora/tui/screens/config/ReviewersTab.js');
    const { lastFrame, unmount } = render(
      <ReviewersTab config={mockConfig} isActive={true} onConfigChange={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('r1');
    expect(frame).toContain('groq');
    unmount();
  });

  it('shows enabled/disabled status for each reviewer', async () => {
    const { ReviewersTab } = await import('@codeagora/tui/screens/config/ReviewersTab.js');
    const { lastFrame, unmount } = render(
      <ReviewersTab config={mockConfig} isActive={true} onConfigChange={() => {}} />
    );
    const frame = lastFrame() ?? '';
    // r1 is enabled (●), r2 is disabled (○)
    expect(frame).toContain('\u25cf'); // ● enabled
    expect(frame).toContain('\u25cb'); // ○ disabled
    unmount();
  });
});

describe('SupportersTab', () => {
  it('shows pool and devils advocate', async () => {
    const { SupportersTab } = await import('@codeagora/tui/screens/config/SupportersTab.js');
    const { lastFrame, unmount } = render(
      <SupportersTab config={mockConfig} isActive={true} onConfigChange={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('s1');
    expect(frame).toContain('da');
    unmount();
  });

  it('shows pickCount and pickStrategy', async () => {
    const { SupportersTab } = await import('@codeagora/tui/screens/config/SupportersTab.js');
    const { lastFrame, unmount } = render(
      <SupportersTab config={mockConfig} isActive={true} onConfigChange={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Pick Count');
    expect(frame).toContain('Pick Strategy');
    unmount();
  });
});

describe('ModeratorTab', () => {
  it('shows moderator provider and model', async () => {
    const { ModeratorTab } = await import('@codeagora/tui/screens/config/ModeratorTab.js');
    const { lastFrame, unmount } = render(
      <ModeratorTab config={mockConfig} isActive={true} onConfigChange={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('groq');
    expect(frame).toContain('llama-3.3-70b-versatile');
    unmount();
  });
});

describe('ReviewersTab edge cases', () => {
  it('shows empty state when reviewers array is empty', async () => {
    const { ReviewersTab } = await import('@codeagora/tui/screens/config/ReviewersTab.js');
    const emptyConfig = { ...mockConfig, reviewers: [] };
    const { lastFrame, unmount } = render(
      <ReviewersTab config={emptyConfig} isActive={true} onConfigChange={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('No reviewers');
    unmount();
  });
});

describe('ConfigScreen no-config state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows PresetsTab content when config load fails', async () => {
    mockLoadConfigFrom.mockRejectedValue(new Error('Config file not found'));
    const { lastFrame, unmount } = render(<ConfigScreen />);
    await waitForRender();
    const frame = lastFrame() ?? '';
    // When config load fails the ConfigScreen renders PresetsTab inline
    expect(frame).toContain('Quick Setup');
    unmount();
  });
});
