import { useState } from 'react';

export type Screen = 'home' | 'review-setup' | 'review' | 'pipeline' | 'sessions' | 'config' | 'results' | 'debate' | 'context';

export interface RouterState {
  screen: Screen;
  navigate: (to: Screen) => void;
  goBack: () => void;
  canGoBack: boolean;
}

export function useRouter(initial: Screen = 'home'): RouterState {
  const [screen, setScreen] = useState<Screen>(initial);
  const [history, setHistory] = useState<Screen[]>([]);

  function navigate(to: Screen): void {
    setHistory(prev => [...prev, screen]);
    setScreen(to);
  }

  function goBack(): void {
    if (history.length === 0) return;
    const prev = history[history.length - 1]!;
    setHistory(h => h.slice(0, -1));
    setScreen(prev);
  }

  return {
    screen,
    navigate,
    goBack,
    canGoBack: history.length > 0,
  };
}
