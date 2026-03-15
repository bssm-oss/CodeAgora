import React, { useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import { useRouter } from './hooks/useRouter.js';
import { Header } from './components/Header.js';
import { StatusBar } from './components/StatusBar.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { ReviewSetupScreen } from './screens/ReviewSetupScreen.js';
import { ReviewScreen } from './screens/ReviewScreen.js';
import { PipelineScreen } from './screens/PipelineScreen.js';
import { SessionsScreen } from './screens/SessionsScreen.js';
import { ConfigScreen } from './screens/ConfigScreen.js';
import { ResultsScreen } from './screens/ResultsScreen.js';
import { DebateScreen } from './screens/DebateScreen.js';
import type { Screen } from './hooks/useRouter.js';
import type { ReviewSetupParams } from './screens/ReviewSetupScreen.js';
import type { PipelineResult } from '../pipeline/orchestrator.js';

export function App(): React.JSX.Element {
  const { exit } = useApp();
  const { screen, navigate, goBack, canGoBack } = useRouter();
  const [reviewParams, setReviewParams] = useState<ReviewSetupParams | undefined>();
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | undefined>();

  useInput((input) => {
    if (input === 'q') {
      if (canGoBack) {
        goBack();
      } else {
        exit();
      }
    }
  });

  function handleReviewSetupNavigate(to: Screen, params?: ReviewSetupParams): void {
    if (params) {
      setReviewParams(params);
    }
    navigate(to);
  }

  function handlePipelineComplete(result: PipelineResult): void {
    setPipelineResult(result);
    navigate('results');
  }

  function renderScreen(s: Screen): React.JSX.Element {
    switch (s) {
      case 'review-setup':
        return (
          <ReviewSetupScreen
            onNavigate={handleReviewSetupNavigate}
            onBack={goBack}
          />
        );
      case 'review':
        return <ReviewScreen diffPath={reviewParams?.diffPath} />;
      case 'pipeline':
        return (
          <PipelineScreen
            diffPath={reviewParams?.diffPath ?? ''}
            onComplete={handlePipelineComplete}
            onError={() => navigate('home')}
          />
        );
      case 'results':
        return pipelineResult
          ? <ResultsScreen result={pipelineResult} />
          : <HomeScreen onNavigate={navigate} onQuit={exit} />;
      case 'sessions':
        return <SessionsScreen />;
      case 'config':
        return <ConfigScreen />;
      case 'debate':
        return (
          <DebateScreen
            discussions={[
              {
                id: 'd001',
                severity: 'CRITICAL',
                title: 'Sample debate',
                filePath: 'src/auth.ts',
                rounds: [],
                status: 'active',
              },
            ]}
          />
        );
      case 'home':
      default:
        return <HomeScreen onNavigate={navigate} onQuit={exit} />;
    }
  }

  return (
    <Box flexDirection="column">
      <Header />
      {renderScreen(screen)}
      <StatusBar screen={screen} canGoBack={canGoBack} />
    </Box>
  );
}
