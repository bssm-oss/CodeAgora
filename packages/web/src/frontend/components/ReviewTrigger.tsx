/**
 * ReviewTrigger — Form component for triggering a code review from the dashboard.
 * Supports three input modes: raw diff text, PR URL, or staged changes.
 */

import React, { useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

type InputMode = 'diff' | 'pr_url' | 'staged';
type ReviewMode = 'quick' | 'full';

interface ReviewTriggerProps {
  onStarted: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ReviewTrigger({ onStarted }: ReviewTriggerProps): React.JSX.Element {
  const [inputMode, setInputMode] = useState<InputMode>('diff');
  const [reviewMode, setReviewMode] = useState<ReviewMode>('full');
  const [diff, setDiff] = useState('');
  const [prUrl, setPrUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit =
    !submitting &&
    (inputMode === 'staged' ||
      (inputMode === 'diff' && diff.trim().length > 0) ||
      (inputMode === 'pr_url' && prUrl.trim().length > 0));

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const body: Record<string, unknown> = {
        mode: reviewMode,
      };

      if (inputMode === 'diff') body['diff'] = diff;
      else if (inputMode === 'pr_url') body['pr_url'] = prUrl;
      else body['staged'] = true;

      if (provider.trim()) body['provider'] = provider.trim();
      if (model.trim()) body['model'] = model.trim();

      try {
        const res = await fetch('/api/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Request failed.' }));
          setError(data.error ?? `Server error (${res.status})`);
          return;
        }

        // Reset form and show success
        setDiff('');
        setPrUrl('');
        setProvider('');
        setModel('');
        setSuccess('Review started! Check Pipeline or Sessions page for results.');
        setTimeout(() => setSuccess(null), 5000);
        onStarted();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error.');
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, diff, prUrl, inputMode, reviewMode, provider, model, onStarted],
  );

  return (
    <form className="review-trigger" onSubmit={handleSubmit}>
      <h3 className="review-trigger__title">Start Review</h3>

      {/* Input mode tabs */}
      <div className="review-trigger__tabs" role="tablist">
        {(['diff', 'pr_url', 'staged'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={inputMode === mode}
            className={`review-trigger__tab ${inputMode === mode ? 'review-trigger__tab--active' : ''}`}
            onClick={() => setInputMode(mode)}
          >
            {mode === 'diff' ? 'Diff Text' : mode === 'pr_url' ? 'PR URL' : 'Staged'}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="review-trigger__input-area">
        {inputMode === 'diff' && (
          <textarea
            className="review-trigger__textarea"
            placeholder="Paste your diff here..."
            value={diff}
            onChange={(e) => setDiff(e.target.value)}
            rows={12}
            spellCheck={false}
          />
        )}

        {inputMode === 'pr_url' && (
          <input
            className="review-trigger__text-input"
            type="url"
            placeholder="https://github.com/owner/repo/pull/123"
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
          />
        )}

        {inputMode === 'staged' && (
          <p className="review-trigger__hint">
            Reviews the currently staged changes in the working directory (git diff --staged).
          </p>
        )}
      </div>

      {/* Mode toggle */}
      <div className="review-trigger__mode-toggle">
        <span className="review-trigger__label">Mode:</span>
        <button
          type="button"
          className={`review-trigger__mode-btn ${reviewMode === 'full' ? 'review-trigger__mode-btn--active' : ''}`}
          onClick={() => setReviewMode('full')}
        >
          Full
        </button>
        <button
          type="button"
          className={`review-trigger__mode-btn ${reviewMode === 'quick' ? 'review-trigger__mode-btn--active' : ''}`}
          onClick={() => setReviewMode('quick')}
        >
          Quick
        </button>
      </div>

      {/* Advanced options (collapsed) */}
      <div className="review-trigger__advanced">
        <button
          type="button"
          className="review-trigger__advanced-toggle"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Hide' : 'Show'} advanced options
        </button>

        {showAdvanced && (
          <div className="review-trigger__advanced-fields">
            <label className="review-trigger__field">
              <span className="review-trigger__label">Provider</span>
              <input
                className="review-trigger__text-input"
                type="text"
                placeholder="e.g. openai, anthropic"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </label>
            <label className="review-trigger__field">
              <span className="review-trigger__label">Model</span>
              <input
                className="review-trigger__text-input"
                type="text"
                placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {/* Success message */}
      {success && (
        <div className="review-trigger__success" role="status">
          {success}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="review-trigger__error" role="alert">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        className="review-trigger__submit"
        disabled={!canSubmit}
      >
        {submitting ? 'Starting...' : 'Start Review'}
      </button>
    </form>
  );
}
