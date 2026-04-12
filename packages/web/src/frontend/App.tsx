import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Dashboard } from './pages/Dashboard.js';
import { Sessions } from './pages/Sessions.js';
import { ReviewDetail } from './pages/ReviewDetail.js';
import { Models } from './pages/Models.js';
import { Costs } from './pages/Costs.js';
import { Discussions } from './pages/Discussions.js';
import { ConfigPage } from './pages/Config.js';
import { Pipeline } from './pages/Pipeline.js';
import { Compare } from './pages/Compare.js';
import { NotFound } from './components/NotFound.js';

// ============================================================================
// ErrorBoundary
// ============================================================================

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p className="error-boundary__message">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            className="error-boundary__button"
            onClick={this.handleReset}
            type="button"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// App
// ============================================================================

export function App(): React.JSX.Element {
  return (
    <Layout>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:date/:id" element={<ReviewDetail />} />
          <Route path="/models" element={<Models />} />
          <Route path="/costs" element={<Costs />} />
          <Route path="/discussions" element={<Discussions />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/compare/:dateA/:idA/:dateB/:idB" element={<Compare />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  );
}
