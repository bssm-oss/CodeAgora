import React, { useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import { useRouter } from './hooks/useRouter.js';
import { Header } from './components/Header.js';
import { StatusBar } from './components/StatusBar.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { ReviewSetupScreen } from './screens/ReviewSetupScreen.js';
import { PipelineScreen } from './screens/PipelineScreen.js';
import { SessionsScreen } from './screens/SessionsScreen.js';
import { ConfigScreen } from './screens/ConfigScreen.js';
import { ResultsScreen } from './screens/ResultsScreen.js';
import { DebateScreen } from './screens/DebateScreen.js';
import { ContextScreen } from './screens/ContextScreen.js';
import type { Screen } from './hooks/useRouter.js';
import type { ReviewSetupParams } from './screens/ReviewSetupScreen.js';
import type { PipelineResult } from '@codeagora/core/pipeline/orchestrator.js';

export function App(): React.JSX.Element {
  const { exit } = useApp();
  const { screen, navigate, goBack, canGoBack } = useRouter();
  const [reviewParams, setReviewParams] = useState<ReviewSetupParams | undefined>();
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | undefined>();
  const [diffContent, setDiffContent] = useState<string>('');
  const [evidenceDocs, setEvidenceDocs] = useState<Array<{
    severity: string;
    filePath: string;
    lineRange: [number, number];
    issueTitle: string;
    suggestion?: string;
  }>>([]);

  useInput((input) => {
    if (input === 'q') {
      // Do not handle 'q' when on a detail/modal screen — let the screen handle it
      if (screen === 'context' || screen === 'sessions' || screen === 'debate') {
        return;
      }
      if (screen === 'results') {
        // From results, go home
        navigate('home');
      } else if (canGoBack) {
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
    // Populate evidenceDocs from topIssues for context view
    const issues = result.summary?.topIssues ?? [];
    setEvidenceDocs(issues.map(iss => ({
      severity: iss.severity,
      filePath: iss.filePath,
      lineRange: iss.lineRange,
      issueTitle: iss.title,
    })));
    // Read diffContent from diffPath if available
    if (reviewParams?.diffPath) {
      import('fs/promises').then(fs =>
        fs.readFile(reviewParams.diffPath, 'utf-8').then(setDiffContent).catch(() => setDiffContent(''))
      );
    }
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
        // ReviewScreen is deprecated; redirect to pipeline if we have params
        return reviewParams ? (
          <PipelineScreen
            diffPath={reviewParams.diffPath}
            onComplete={handlePipelineComplete}
            onError={() => navigate('home')}
          />
        ) : (
          <HomeScreen onNavigate={navigate} onQuit={exit} />
        );
      case 'pipeline':
        if (!reviewParams?.diffPath) {
          return (
            <HomeScreen onNavigate={navigate} onQuit={exit} />
          );
        }
        return (
          <PipelineScreen
            diffPath={reviewParams.diffPath}
            onComplete={handlePipelineComplete}
            onError={() => navigate('home')}
          />
        );
      case 'results':
        return pipelineResult
          ? (
            <ResultsScreen
              result={pipelineResult}
              onHome={() => navigate('home')}
              onViewContext={() => navigate('context')}
            />
          )
          : <HomeScreen onNavigate={navigate} onQuit={exit} />;
      case 'context':
        return (
          <ContextScreen
            diffContent={diffContent}
            evidenceDocs={evidenceDocs}
            onBack={() => navigate('results')}
          />
        );
      case 'sessions':
        return <SessionsScreen />;
      case 'config':
        return <ConfigScreen />;
      case 'debate': {
        const discussions = (pipelineResult?.discussions ?? []).map((d) => ({
          id: d.discussionId,
          severity: d.finalSeverity === 'DISMISSED' ? 'SUGGESTION' : d.finalSeverity,
          title: d.reasoning,
          filePath: d.filePath,
          rounds: [],
          status: (d.consensusReached ? 'resolved' : 'active') as 'pending' | 'active' | 'resolved' | 'escalated',
        }));
        return <DebateScreen discussions={discussions} />;
      }
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
