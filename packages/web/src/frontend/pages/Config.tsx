/**
 * ConfigPage — Config management page.
 * Form-based editor organized by sections with save, validation, and JSON preview.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useApi } from '../hooks/useApi.js';
import { ConfigSection } from '../components/ConfigSection.js';
import { ConfigField } from '../components/ConfigField.js';
import { ReviewerEditor } from '../components/ReviewerEditor.js';
import { ConfigPreview } from '../components/ConfigPreview.js';
import { Toast } from '../components/Toast.js';
import type { ToastType } from '../components/Toast.js';
import { validateConfigField, getDefaultConfig } from '../utils/config-helpers.js';
import type { AgentConfig } from '../utils/config-helpers.js';

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

  // Sync server config into local state
  useEffect(() => {
    if (serverConfig && !initialized) {
      setConfig(serverConfig as unknown as Record<string, unknown>);
      setInitialized(true);
    }
  }, [serverConfig, initialized]);

  // When there's no config (404), use defaults
  useEffect(() => {
    if (!loading && error && error.includes('404') && !initialized) {
      setConfig(getDefaultConfig() as unknown as Record<string, unknown>);
      setInitialized(true);
    }
  }, [loading, error, initialized]);

  const updateField = useCallback((path: string, value: unknown) => {
    setConfig((prev) => setNestedValue(prev, path, value));

    // Validate the field
    const fieldName = path.split('.').pop() ?? path;
    const validationError = validateConfigField(fieldName, value);
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
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

      {/* General Section */}
      <ConfigSection title="General" description="Mode and language settings" defaultExpanded>
        <div className="config-fields-grid">
          <ConfigField
            label="Mode"
            description="Review strictness level"
            type="select"
            value={getNestedValue(config, 'mode') ?? 'pragmatic'}
            onChange={(v) => updateField('mode', v)}
            options={['strict', 'pragmatic']}
            error={errors['mode']}
          />
          <ConfigField
            label="Language"
            description="Output language"
            type="select"
            value={getNestedValue(config, 'language') ?? 'en'}
            onChange={(v) => updateField('language', v)}
            options={['en', 'ko']}
            error={errors['language']}
          />
        </div>
      </ConfigSection>

      {/* Reviewers Section */}
      <ConfigSection title="Reviewers" description="Configure reviewer models and backends">
        <ReviewerEditor
          reviewers={reviewers}
          onChange={(r) => updateField('reviewers', r)}
        />
      </ConfigSection>

      {/* Supporters Section */}
      <ConfigSection title="Supporters" description="Discussion supporter pool configuration">
        <div className="config-fields-grid">
          <ConfigField
            label="Pick Count"
            description="Number of supporters to select per discussion"
            type="number"
            value={getNestedValue(config, 'supporters.pickCount') ?? 2}
            onChange={(v) => updateField('supporters.pickCount', v)}
            error={errors['supporters.pickCount']}
          />
          <ConfigField
            label="Pick Strategy"
            description="How to select supporters"
            type="select"
            value={getNestedValue(config, 'supporters.pickStrategy') ?? 'random'}
            onChange={(v) => updateField('supporters.pickStrategy', v)}
            options={['random', 'round-robin']}
            error={errors['supporters.pickStrategy']}
          />
          <ConfigField
            label="Persona Assignment"
            description="How personas are assigned to supporters"
            type="select"
            value={getNestedValue(config, 'supporters.personaAssignment') ?? 'random'}
            onChange={(v) => updateField('supporters.personaAssignment', v)}
            options={['random', 'fixed']}
            error={errors['supporters.personaAssignment']}
          />
          <ConfigField
            label="Persona Pool"
            description="Available personas for supporters"
            type="array"
            value={getNestedValue(config, 'supporters.personaPool') ?? []}
            onChange={(v) => updateField('supporters.personaPool', v)}
            placeholder="Add persona..."
          />
        </div>
      </ConfigSection>

      {/* Discussion Section */}
      <ConfigSection title="Discussion" description="Discussion rounds and thresholds">
        <div className="config-fields-grid">
          <ConfigField
            label="Max Rounds"
            description="Maximum discussion rounds"
            type="number"
            value={getNestedValue(config, 'discussion.maxRounds') ?? 3}
            onChange={(v) => updateField('discussion.maxRounds', v)}
            error={errors['discussion.maxRounds']}
          />
          <ConfigField
            label="Code Snippet Range"
            description="Lines of context around code snippets"
            type="number"
            value={getNestedValue(config, 'discussion.codeSnippetRange') ?? 5}
            onChange={(v) => updateField('discussion.codeSnippetRange', v)}
            error={errors['discussion.codeSnippetRange']}
          />
          <ConfigField
            label="Harshly Critical Threshold"
            description="Registration threshold (0-1)"
            type="number"
            value={getNestedValue(config, 'discussion.registrationThreshold.HARSHLY_CRITICAL') ?? 0.3}
            onChange={(v) => updateField('discussion.registrationThreshold.HARSHLY_CRITICAL', v)}
            error={errors['discussion.registrationThreshold.HARSHLY_CRITICAL']}
          />
          <ConfigField
            label="Critical Threshold"
            description="Registration threshold (0-1)"
            type="number"
            value={getNestedValue(config, 'discussion.registrationThreshold.CRITICAL') ?? 0.5}
            onChange={(v) => updateField('discussion.registrationThreshold.CRITICAL', v)}
            error={errors['discussion.registrationThreshold.CRITICAL']}
          />
          <ConfigField
            label="Warning Threshold"
            description="Registration threshold (0-1)"
            type="number"
            value={getNestedValue(config, 'discussion.registrationThreshold.WARNING') ?? 0.7}
            onChange={(v) => updateField('discussion.registrationThreshold.WARNING', v)}
            error={errors['discussion.registrationThreshold.WARNING']}
          />
        </div>
      </ConfigSection>

      {/* Error Handling Section */}
      <ConfigSection title="Error Handling" description="Retry and failure thresholds">
        <div className="config-fields-grid">
          <ConfigField
            label="Max Retries"
            description="Maximum retry attempts"
            type="number"
            value={getNestedValue(config, 'errorHandling.maxRetries') ?? 3}
            onChange={(v) => updateField('errorHandling.maxRetries', v)}
            error={errors['errorHandling.maxRetries']}
          />
          <ConfigField
            label="Forfeit Threshold"
            description="Failures before forfeiting"
            type="number"
            value={getNestedValue(config, 'errorHandling.forfeitThreshold') ?? 2}
            onChange={(v) => updateField('errorHandling.forfeitThreshold', v)}
            error={errors['errorHandling.forfeitThreshold']}
          />
          <ConfigField
            label="Max Tokens (Chunking)"
            description="Maximum tokens per chunk"
            type="number"
            value={getNestedValue(config, 'chunking.maxTokens') ?? 8000}
            onChange={(v) => updateField('chunking.maxTokens', v)}
            error={errors['chunking.maxTokens']}
          />
        </div>
      </ConfigSection>

      {/* Notifications Section */}
      <ConfigSection title="Notifications" description="Discord and Slack webhook settings">
        <div className="config-fields-grid">
          <ConfigField
            label="Auto Notify"
            description="Automatically send notifications after review"
            type="boolean"
            value={getNestedValue(config, 'notifications.autoNotify') ?? false}
            onChange={(v) => updateField('notifications.autoNotify', v)}
          />
          <ConfigField
            label="Discord Webhook URL"
            description="Discord notification webhook"
            type="text"
            value={getNestedValue(config, 'notifications.discord.webhookUrl') ?? ''}
            onChange={(v) => updateField('notifications.discord.webhookUrl', v)}
            placeholder="https://discord.com/api/webhooks/..."
            error={errors['notifications.discord.webhookUrl']}
          />
          <ConfigField
            label="Slack Webhook URL"
            description="Slack notification webhook"
            type="text"
            value={getNestedValue(config, 'notifications.slack.webhookUrl') ?? ''}
            onChange={(v) => updateField('notifications.slack.webhookUrl', v)}
            placeholder="https://hooks.slack.com/services/..."
            error={errors['notifications.slack.webhookUrl']}
          />
        </div>
      </ConfigSection>

      {/* GitHub Section */}
      <ConfigSection title="GitHub" description="GitHub integration settings">
        <div className="config-fields-grid">
          <ConfigField
            label="Post Suggestions"
            description="Post review suggestions as GitHub comments"
            type="boolean"
            value={getNestedValue(config, 'github.postSuggestions') ?? true}
            onChange={(v) => updateField('github.postSuggestions', v)}
          />
          <ConfigField
            label="Collapse Discussions"
            description="Collapse discussion details in PR comments"
            type="boolean"
            value={getNestedValue(config, 'github.collapseDiscussions') ?? true}
            onChange={(v) => updateField('github.collapseDiscussions', v)}
          />
          <ConfigField
            label="Needs Human Label"
            description="Label for PRs requiring human review"
            type="text"
            value={getNestedValue(config, 'github.needsHumanLabel') ?? 'needs-human-review'}
            onChange={(v) => updateField('github.needsHumanLabel', v)}
            error={errors['github.needsHumanLabel']}
          />
          <ConfigField
            label="Human Reviewers"
            description="GitHub usernames for human review assignment"
            type="array"
            value={getNestedValue(config, 'github.humanReviewers') ?? []}
            onChange={(v) => updateField('github.humanReviewers', v)}
            placeholder="Add GitHub username..."
          />
          <ConfigField
            label="Human Teams"
            description="GitHub teams for human review assignment"
            type="array"
            value={getNestedValue(config, 'github.humanTeams') ?? []}
            onChange={(v) => updateField('github.humanTeams', v)}
            placeholder="Add GitHub team..."
          />
          <ConfigField
            label="SARIF Output Path"
            description="Path for SARIF report output"
            type="text"
            value={getNestedValue(config, 'github.sarifOutputPath') ?? ''}
            onChange={(v) => updateField('github.sarifOutputPath', v)}
            placeholder="e.g. results.sarif"
          />
        </div>
      </ConfigSection>

      {/* Auto-Approve Section */}
      <ConfigSection title="Auto-Approve" description="Automatic approval for low-risk changes">
        <div className="config-fields-grid">
          <ConfigField
            label="Enabled"
            description="Enable auto-approval"
            type="boolean"
            value={getNestedValue(config, 'autoApprove.enabled') ?? false}
            onChange={(v) => updateField('autoApprove.enabled', v)}
          />
          <ConfigField
            label="Max Lines"
            description="Maximum changed lines for auto-approval"
            type="number"
            value={getNestedValue(config, 'autoApprove.maxLines') ?? 50}
            onChange={(v) => updateField('autoApprove.maxLines', v)}
            error={errors['autoApprove.maxLines']}
          />
          <ConfigField
            label="Allowed File Patterns"
            description="Glob patterns eligible for auto-approval"
            type="array"
            value={getNestedValue(config, 'autoApprove.allowedFilePatterns') ?? []}
            onChange={(v) => updateField('autoApprove.allowedFilePatterns', v)}
            placeholder="e.g. *.md, *.txt"
          />
        </div>
      </ConfigSection>

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
