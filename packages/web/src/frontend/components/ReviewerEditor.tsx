/**
 * ReviewerEditor — Reviewer list editor component.
 * Manages a list of reviewer (AgentConfig) entries with add/remove/edit capabilities.
 * Compact card layout per reviewer.
 */

import React, { useCallback } from 'react';
import type { AgentConfig } from '../utils/config-helpers.js';

const BACKEND_OPTIONS = ['api', 'opencode', 'codex', 'gemini', 'claude', 'copilot'] as const;

interface ReviewerEditorProps {
  reviewers: AgentConfig[];
  onChange: (reviewers: AgentConfig[]) => void;
}

export function ReviewerEditor({ reviewers, onChange }: ReviewerEditorProps): React.JSX.Element {
  const handleAdd = useCallback(() => {
    const newReviewer: AgentConfig = {
      id: `reviewer-${Date.now()}`,
      model: '',
      backend: 'api',
      timeout: 120,
      enabled: true,
    };
    onChange([...reviewers, newReviewer]);
  }, [reviewers, onChange]);

  const handleRemove = useCallback((index: number) => {
    onChange(reviewers.filter((_, i) => i !== index));
  }, [reviewers, onChange]);

  const handleUpdate = useCallback((index: number, field: keyof AgentConfig, value: unknown) => {
    const updated = reviewers.map((r, i) => {
      if (i !== index) return r;
      return { ...r, [field]: value };
    });
    onChange(updated);
  }, [reviewers, onChange]);

  return (
    <div className="reviewer-editor">
      <div className="reviewer-editor__list">
        {reviewers.map((reviewer, index) => (
          <div key={reviewer.id} className="reviewer-card">
            <div className="reviewer-card__header">
              <span className="reviewer-card__id">{reviewer.id}</span>
              <div className="reviewer-card__actions">
                <button
                  className={`reviewer-card__toggle ${reviewer.enabled ? 'reviewer-card__toggle--on' : ''}`}
                  onClick={() => handleUpdate(index, 'enabled', !reviewer.enabled)}
                  type="button"
                  title={reviewer.enabled ? 'Disable' : 'Enable'}
                >
                  {reviewer.enabled ? 'ON' : 'OFF'}
                </button>
                <button
                  className="reviewer-card__remove"
                  onClick={() => handleRemove(index)}
                  type="button"
                  aria-label="Remove reviewer"
                >
                  \u00D7
                </button>
              </div>
            </div>
            <div className="reviewer-card__fields">
              <div className="reviewer-card__field">
                <label className="reviewer-card__label">ID</label>
                <input
                  className="reviewer-card__input"
                  type="text"
                  value={reviewer.id}
                  onChange={(e) => handleUpdate(index, 'id', e.target.value)}
                />
              </div>
              <div className="reviewer-card__field">
                <label className="reviewer-card__label">Model</label>
                <input
                  className="reviewer-card__input"
                  type="text"
                  value={reviewer.model}
                  onChange={(e) => handleUpdate(index, 'model', e.target.value)}
                  placeholder="e.g. gpt-4"
                />
              </div>
              <div className="reviewer-card__field">
                <label className="reviewer-card__label">Backend</label>
                <select
                  className="reviewer-card__select"
                  value={reviewer.backend}
                  onChange={(e) => handleUpdate(index, 'backend', e.target.value)}
                >
                  {BACKEND_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="reviewer-card__field">
                <label className="reviewer-card__label">Provider</label>
                <input
                  className="reviewer-card__input"
                  type="text"
                  value={reviewer.provider ?? ''}
                  onChange={(e) => handleUpdate(index, 'provider', e.target.value || undefined)}
                  placeholder="optional"
                />
              </div>
              <div className="reviewer-card__field">
                <label className="reviewer-card__label">Timeout (s)</label>
                <input
                  className="reviewer-card__input reviewer-card__input--number"
                  type="number"
                  value={reviewer.timeout}
                  onChange={(e) => handleUpdate(index, 'timeout', Number(e.target.value))}
                  min={0}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="reviewer-editor__add" onClick={handleAdd} type="button">
        + Add Reviewer
      </button>
    </div>
  );
}

export type { ReviewerEditorProps };
