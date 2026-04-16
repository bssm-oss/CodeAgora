import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { Text } from 'ink';
import { useRouter } from '../hooks/useRouter.js';
import type { Screen } from '../hooks/useRouter.js';

afterEach(() => {
  cleanup();
});

/**
 * Helper component that exposes useRouter state as text so we can assert on lastFrame().
 * Receives a callback ref that lets the test imperatively call navigate/goBack.
 */
function RouterHarness({ initial, actionsRef }: {
  initial?: Screen;
  actionsRef: React.MutableRefObject<{ navigate: (to: Screen) => void; goBack: () => void } | null>;
}): React.JSX.Element {
  const { screen, navigate, goBack, canGoBack } = useRouter(initial);
  actionsRef.current = { navigate, goBack };
  return <Text>screen={screen} canGoBack={String(canGoBack)}</Text>;
}

describe('useRouter', () => {
  it('defaults to home screen', () => {
    const ref = { current: null } as React.MutableRefObject<{ navigate: (to: Screen) => void; goBack: () => void } | null>;
    const { lastFrame } = render(<RouterHarness actionsRef={ref} />);
    expect(lastFrame()).toContain('screen=home');
    expect(lastFrame()).toContain('canGoBack=false');
  });

  it('respects custom initial screen', () => {
    const ref = { current: null } as React.MutableRefObject<{ navigate: (to: Screen) => void; goBack: () => void } | null>;
    const { lastFrame } = render(<RouterHarness initial="config" actionsRef={ref} />);
    expect(lastFrame()).toContain('screen=config');
  });

  it('navigates to a new screen and enables goBack', async () => {
    const ref = { current: null } as React.MutableRefObject<{ navigate: (to: Screen) => void; goBack: () => void } | null>;
    const { lastFrame } = render(<RouterHarness actionsRef={ref} />);

    // Navigate
    await new Promise<void>(r => {
      ref.current!.navigate('pipeline');
      // ink batches renders — wait a tick
      setTimeout(r, 50);
    });

    expect(lastFrame()).toContain('screen=pipeline');
    expect(lastFrame()).toContain('canGoBack=true');
  });

  it('goBack returns to previous screen', async () => {
    const ref = { current: null } as React.MutableRefObject<{ navigate: (to: Screen) => void; goBack: () => void } | null>;
    const { lastFrame } = render(<RouterHarness actionsRef={ref} />);

    await new Promise<void>(r => { ref.current!.navigate('results'); setTimeout(r, 50); });
    await new Promise<void>(r => { ref.current!.goBack(); setTimeout(r, 50); });

    expect(lastFrame()).toContain('screen=home');
    expect(lastFrame()).toContain('canGoBack=false');
  });

  it('maintains navigation history through multiple screens', async () => {
    const ref = { current: null } as React.MutableRefObject<{ navigate: (to: Screen) => void; goBack: () => void } | null>;
    const { lastFrame } = render(<RouterHarness actionsRef={ref} />);

    await new Promise<void>(r => { ref.current!.navigate('review-setup'); setTimeout(r, 50); });
    await new Promise<void>(r => { ref.current!.navigate('pipeline'); setTimeout(r, 50); });
    await new Promise<void>(r => { ref.current!.navigate('results'); setTimeout(r, 50); });

    expect(lastFrame()).toContain('screen=results');
    expect(lastFrame()).toContain('canGoBack=true');

    // Go back through history
    await new Promise<void>(r => { ref.current!.goBack(); setTimeout(r, 50); });
    expect(lastFrame()).toContain('screen=pipeline');

    await new Promise<void>(r => { ref.current!.goBack(); setTimeout(r, 50); });
    expect(lastFrame()).toContain('screen=review-setup');

    await new Promise<void>(r => { ref.current!.goBack(); setTimeout(r, 50); });
    expect(lastFrame()).toContain('screen=home');
    expect(lastFrame()).toContain('canGoBack=false');
  });

  it('goBack is a no-op when history is empty', async () => {
    const ref = { current: null } as React.MutableRefObject<{ navigate: (to: Screen) => void; goBack: () => void } | null>;
    const { lastFrame } = render(<RouterHarness actionsRef={ref} />);

    // goBack on empty history should stay on home
    await new Promise<void>(r => { ref.current!.goBack(); setTimeout(r, 50); });
    expect(lastFrame()).toContain('screen=home');
    expect(lastFrame()).toContain('canGoBack=false');
  });
});
