import { describe, it, expect } from 'vitest';
import React, { useState } from 'react';
import { render } from 'ink-testing-library';
import { Text, Box } from 'ink';
import { Header } from '@codeagora/tui/components/Header.js';
import { StatusBar } from '@codeagora/tui/components/StatusBar.js';
import { HomeScreen } from '@codeagora/tui/screens/HomeScreen.js';
import { useRouter } from '@codeagora/tui/hooks/useRouter.js';

// Helper component to expose useRouter state
function RouterTestComponent({ action }: { action?: (state: ReturnType<typeof useRouter>) => void }) {
  const router = useRouter();
  // Call action on first render if provided
  React.useEffect(() => {
    action?.(router);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Box flexDirection="column">
      <Text>screen:{router.screen}</Text>
      <Text>canGoBack:{String(router.canGoBack)}</Text>
    </Box>
  );
}

describe('Header', () => {
  it('renders CodeAgora text', () => {
    const { lastFrame } = render(<Header />);
    expect(lastFrame()).toContain('CodeAgora');
  });
});

describe('StatusBar', () => {
  it('shows screen name', () => {
    const { lastFrame } = render(<StatusBar screen="home" canGoBack={false} />);
    expect(lastFrame()).toContain('home');
  });

  it('shows quit when canGoBack is false', () => {
    const { lastFrame } = render(<StatusBar screen="home" canGoBack={false} />);
    expect(lastFrame()).toContain('quit');
  });

  it('shows back when canGoBack is true', () => {
    const { lastFrame } = render(<StatusBar screen="review" canGoBack={true} />);
    expect(lastFrame()).toContain('back');
  });
});

describe('HomeScreen', () => {
  it('renders all 4 menu items', () => {
    const { lastFrame } = render(
      <HomeScreen onNavigate={() => {}} onQuit={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Review');
    expect(frame).toContain('Sessions');
    expect(frame).toContain('Config');
    expect(frame).toContain('Quit');
  });
});

describe('useRouter', () => {
  it('starts at home screen', () => {
    const { lastFrame } = render(<RouterTestComponent />);
    expect(lastFrame()).toContain('screen:home');
  });

  it('canGoBack is false initially', () => {
    const { lastFrame } = render(<RouterTestComponent />);
    expect(lastFrame()).toContain('canGoBack:false');
  });

  it('navigate changes screen and canGoBack becomes true', async () => {
    // We need to trigger navigate after mount
    let routerRef: ReturnType<typeof useRouter> | undefined;

    function TestNav() {
      const router = useRouter();
      routerRef = router;
      return (
        <Box flexDirection="column">
          <Text>screen:{router.screen}</Text>
          <Text>canGoBack:{String(router.canGoBack)}</Text>
        </Box>
      );
    }

    const { lastFrame, rerender } = render(<TestNav />);
    expect(lastFrame()).toContain('screen:home');
    expect(lastFrame()).toContain('canGoBack:false');

    // Navigate to review
    routerRef!.navigate('review');
    rerender(<TestNav />);

    expect(lastFrame()).toContain('screen:review');
    expect(lastFrame()).toContain('canGoBack:true');
  });

  it('goBack returns to previous screen', () => {
    let routerRef: ReturnType<typeof useRouter> | undefined;

    function TestBack() {
      const router = useRouter();
      routerRef = router;
      return (
        <Box flexDirection="column">
          <Text>screen:{router.screen}</Text>
          <Text>canGoBack:{String(router.canGoBack)}</Text>
        </Box>
      );
    }

    const { lastFrame, rerender } = render(<TestBack />);

    routerRef!.navigate('sessions');
    rerender(<TestBack />);
    expect(lastFrame()).toContain('screen:sessions');

    routerRef!.goBack();
    rerender(<TestBack />);
    expect(lastFrame()).toContain('screen:home');
    expect(lastFrame()).toContain('canGoBack:false');
  });
});
