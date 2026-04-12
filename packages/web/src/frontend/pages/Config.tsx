/**
 * ConfigPage — Config management page.
 * Form-based editor organized by sections with save, validation, and JSON preview.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useApi } from '../hooks/useApi.js';
import { ConfigPreview } from '../components/ConfigPreview.js';
import { Toast } from '../components/Toast.js';
import type { ToastType } from '../components/Toast.js';
import { validateConfigField, getDefaultConfig } from '../utils/config-helpers.js';
import type { AgentConfig } from '../utils/config-helpers.js';
import {
  GeneralSection,
  ReviewersSection,
  SupportersSection,
  DiscussionSection,
  ErrorHandlingSection,
  NotificationsSection,
  GitHubSection,
  AutoApproveSection,
} from '../components/config-sections.js';

// ============================================================================
// Types
// ============================================================================

interface ToastState {
  message: string;
  type: ToastType;
}

interface ConfigData {
  mode?: string;
  language?: string;
  reviewers: AgentConfig[];
  supporters: {
    pool: AgentConfig[];
    pickCount: number;
    pickStrategy: string;
    devilsAdvocate: AgentConfig;
    personaPool: string[];
    personaAssignment: string;
  };
  moderator: { backend: string; model: string; provider?: string };
  head?: { backend: string; model: string; provider?: string; enabled: boolean };
  discussion: {
    maxRounds: number;
    registrationThreshold: {
      HARSHLY_CRITICAL: number;
      CRITICAL: number;
      WARNING: number;
      SUGGESTION: null;
    };
    codeSnippetRange: number;
  };
  errorHandling: { maxRetries: number; forfeitThreshold: number };
  chunking?: { maxTokens: number };
  notifications?: {
    discord?: { webhookUrl: string };
    slack?: { webhookUrl: string };
    autoNotify?: boolean;
  };
  github?: {
    humanReviewers: string[];
    humanTeams: string[];
    needsHumanLabel: string;
    postSuggestions: boolean;
    collapseDiscussions: boolean;
    sarifOutputPath?: string;
  };
  autoApprove?: {
    enabled: boolean;
    maxLines: number;
    allowedFilePatterns: string[];
  };
}

// ============================================================================
// Helper: deep update a nested field
// ============================================================================

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  const result = { ...obj };
  let current: Record<string, unknown> = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    current[part] = { ...(current[part] as Record<string, unknown> ?? {}) };
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return result;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ============================================================================
// Page Component
// ============================================================================

export function ConfigPage(): React.JSX.Element {
  const { data: serverConfig, loading, error, refetch } = useApi<ConfigData>('/api/config');
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [preEditSnapshot, setPreEditSnapshot] = useState<Record<string, unknown> | null>(null);

  // Sync server config into local state and capture last-known-good snapshot
  useEffect(() => {
    if (serverConfig && !initialized) {
      const serverData = serverConfig as unknown as Record<string, unknown>;
      setConfig(serverData);
      setPreEditSnapshot(structuredClone(serverData));
      setInitialized(true);
    }
  }, [serverConfig, initialized]);

  // When there's no config (404), use defaults
  useEffect(() => {
    if (!loading && error && error.includes('404') && !initialized) {
      const defaults = getDefaultConfig() as unknown as Record<string, unknown>;
      setConfig(defaults);
      setPreEditSnapshot(structuredClone(defaults));
      setInitialized(true);
    }
  }, [loading, error, initialized]);

  const updateField = useCallback((path: string, value: unknown) => {
    setConfig((prev) => setNestedValue(prev, path, value));

    // Validate using full path to avoid name collisions between sections
    const validationError = validateConfigField(path, value);
    setErrors((prev) => {
      const next = { ...prev };
      if (validationError) {
        next[path] = validationError;
      } else {
        delete next[path];
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('codeagora-token') ?? '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        const details = body.details;
        let message = 'Failed to save configuration';
        if (details && Array.isArray(details) && details.length > 0) {
          const firstIssue = details[0] as Record<string, unknown>;
          message = `Validation error: ${String(firstIssue.message ?? '')}`;
        }
        setToast({ message, type: 'error' });
      } else {
        setToast({ message: 'Configuration saved successfully', type: 'success' });
        setPreEditSnapshot(structuredClone(config));
        refetch();
      }
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to save configuration',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [config, refetch]);

  const handleRevert = useCallback(() => {
    if (preEditSnapshot) {
      setConfig(structuredClone(preEditSnapshot));
      setErrors({});
      setToast({ message: 'Reverted to previous configuration', type: 'success' });
    }
  }, [preEditSnapshot]);

  if (loading && !initialized) {
    return (
      <div className="page">
        <h2>Configuration</h2>
        <p>Loading configuration...</p>
      </div>
    );
  }

  if (error && !error.includes('404') && !initialized) {
    return (
      <div className="page">
        <h2>Configuration</h2>
        <p className="error-text">Error: {error}</p>
        <button onClick={refetch} type="button" className="retry-button">Retry</button>
      </div>
    );
  }

  const hasErrors = Object.keys(errors).length > 0;
  const reviewers = (getNestedValue(config, 'reviewers') as AgentConfig[] | undefined) ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <h2>Configuration</h2>
        <div className="config-actions">
          <button
            className={`config-preview-toggle ${showPreview ? 'config-preview-toggle--active' : ''}`}
            onClick={() => setShowPreview(!showPreview)}
            type="button"
          >
            {showPreview ? 'Hide JSON' : 'Show JSON'}
          </button>
          {preEditSnapshot && JSON.stringify(preEditSnapshot) !== JSON.stringify(config) && (
            <button
              className="config-revert-button"
              onClick={handleRevert}
              type="button"
            >
              Revert
            </button>
          )}
          <button
            className="config-save-button"
            onClick={handleSave}
            type="button"
            disabled={saving || hasErrors}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {showPreview && <ConfigPreview config={config} />}

      <GeneralSection config={config} errors={errors} updateField={updateField} getNestedValue={getNestedValue} />
      <ReviewersSection config={config} errors={errors} updateField={updateField} getNestedValue={getNestedValue} reviewers={reviewers} />
      <SupportersSection config={config} errors={errors} updateField={updateField} getNestedValue={getNestedValue} />
      <DiscussionSection config={config} errors={errors} updateField={updateField} getNestedValue={getNestedValue} />
      <ErrorHandlingSection config={config} errors={errors} updateField={updateField} getNestedValue={getNestedValue} />
      <NotificationsSection config={config} errors={errors} updateField={updateField} getNestedValue={getNestedValue} />
      <GitHubSection config={config} errors={errors} updateField={updateField} getNestedValue={getNestedValue} />
      <AutoApproveSection config={config} errors={errors} updateField={updateField} getNestedValue={getNestedValue} />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
