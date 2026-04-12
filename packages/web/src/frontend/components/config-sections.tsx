/**
 * Config Section Components — extracted from ConfigPage for maintainability.
 * Each section receives config values via getNestedValue and dispatches
 * changes via updateField.
 */

import React from 'react';
import { ConfigSection } from './ConfigSection.js';
import { ConfigField } from './ConfigField.js';
import { ReviewerEditor } from './ReviewerEditor.js';
import type { AgentConfig } from '../utils/config-helpers.js';

// ============================================================================
// Shared Props
// ============================================================================

interface SectionProps {
  config: Record<string, unknown>;
  errors: Record<string, string>;
  updateField: (path: string, value: unknown) => void;
  getNestedValue: (obj: Record<string, unknown>, path: string) => unknown;
}

// ============================================================================
// General
// ============================================================================

export function GeneralSection({ config, errors, updateField, getNestedValue }: SectionProps): React.JSX.Element {
  return (
    <ConfigSection title="General" description="Mode and language settings" defaultExpanded>
      <div className="config-fields-grid">
        <ConfigField
          label="Mode" description="Review strictness level" type="select"
          value={getNestedValue(config, 'mode') ?? 'pragmatic'}
          onChange={(v) => updateField('mode', v)}
          options={['strict', 'pragmatic']} error={errors['mode']}
        />
        <ConfigField
          label="Language" description="Output language" type="select"
          value={getNestedValue(config, 'language') ?? 'en'}
          onChange={(v) => updateField('language', v)}
          options={['en', 'ko']} error={errors['language']}
        />
      </div>
    </ConfigSection>
  );
}

// ============================================================================
// Reviewers
// ============================================================================

interface ReviewersSectionProps extends SectionProps {
  reviewers: AgentConfig[];
}

export function ReviewersSection({ reviewers, updateField }: ReviewersSectionProps): React.JSX.Element {
  return (
    <ConfigSection title="Reviewers" description="Configure reviewer models and backends">
      <ReviewerEditor reviewers={reviewers} onChange={(r) => updateField('reviewers', r)} />
    </ConfigSection>
  );
}

// ============================================================================
// Supporters
// ============================================================================

export function SupportersSection({ config, errors, updateField, getNestedValue }: SectionProps): React.JSX.Element {
  return (
    <ConfigSection title="Supporters" description="Discussion supporter pool configuration">
      <div className="config-fields-grid">
        <ConfigField
          label="Pick Count" description="Number of supporters to select per discussion" type="number"
          value={getNestedValue(config, 'supporters.pickCount') ?? 2}
          onChange={(v) => updateField('supporters.pickCount', v)} error={errors['supporters.pickCount']}
        />
        <ConfigField
          label="Pick Strategy" description="How to select supporters" type="select"
          value={getNestedValue(config, 'supporters.pickStrategy') ?? 'random'}
          onChange={(v) => updateField('supporters.pickStrategy', v)}
          options={['random']} error={errors['supporters.pickStrategy']}
        />
        <ConfigField
          label="Persona Assignment" description="How personas are assigned to supporters" type="select"
          value={getNestedValue(config, 'supporters.personaAssignment') ?? 'random'}
          onChange={(v) => updateField('supporters.personaAssignment', v)}
          options={['random']} error={errors['supporters.personaAssignment']}
        />
        <ConfigField
          label="Persona Pool" description="Available personas for supporters" type="array"
          value={getNestedValue(config, 'supporters.personaPool') ?? []}
          onChange={(v) => updateField('supporters.personaPool', v)} placeholder="Add persona..."
        />
      </div>
    </ConfigSection>
  );
}

// ============================================================================
// Discussion
// ============================================================================

export function DiscussionSection({ config, errors, updateField, getNestedValue }: SectionProps): React.JSX.Element {
  return (
    <ConfigSection title="Discussion" description="Discussion rounds and thresholds">
      <div className="config-fields-grid">
        <ConfigField
          label="Max Rounds" description="Maximum discussion rounds" type="number"
          value={getNestedValue(config, 'discussion.maxRounds') ?? 3}
          onChange={(v) => updateField('discussion.maxRounds', v)} error={errors['discussion.maxRounds']}
        />
        <ConfigField
          label="Code Snippet Range" description="Lines of context around code snippets" type="number"
          value={getNestedValue(config, 'discussion.codeSnippetRange') ?? 5}
          onChange={(v) => updateField('discussion.codeSnippetRange', v)} error={errors['discussion.codeSnippetRange']}
        />
        <ConfigField
          label="Harshly Critical Threshold" description="Registration threshold (0-1)" type="number"
          value={getNestedValue(config, 'discussion.registrationThreshold.HARSHLY_CRITICAL') ?? 0.3}
          onChange={(v) => updateField('discussion.registrationThreshold.HARSHLY_CRITICAL', v)}
          error={errors['discussion.registrationThreshold.HARSHLY_CRITICAL']}
        />
        <ConfigField
          label="Critical Threshold" description="Registration threshold (0-1)" type="number"
          value={getNestedValue(config, 'discussion.registrationThreshold.CRITICAL') ?? 0.5}
          onChange={(v) => updateField('discussion.registrationThreshold.CRITICAL', v)}
          error={errors['discussion.registrationThreshold.CRITICAL']}
        />
        <ConfigField
          label="Warning Threshold" description="Registration threshold (0-1)" type="number"
          value={getNestedValue(config, 'discussion.registrationThreshold.WARNING') ?? 0.7}
          onChange={(v) => updateField('discussion.registrationThreshold.WARNING', v)}
          error={errors['discussion.registrationThreshold.WARNING']}
        />
      </div>
    </ConfigSection>
  );
}

// ============================================================================
// Error Handling + Chunking
// ============================================================================

export function ErrorHandlingSection({ config, errors, updateField, getNestedValue }: SectionProps): React.JSX.Element {
  return (
    <ConfigSection title="Error Handling" description="Retry and failure thresholds">
      <div className="config-fields-grid">
        <ConfigField
          label="Max Retries" description="Maximum retry attempts" type="number"
          value={getNestedValue(config, 'errorHandling.maxRetries') ?? 3}
          onChange={(v) => updateField('errorHandling.maxRetries', v)} error={errors['errorHandling.maxRetries']}
        />
        <ConfigField
          label="Forfeit Threshold" description="Failures before forfeiting" type="number"
          value={getNestedValue(config, 'errorHandling.forfeitThreshold') ?? 2}
          onChange={(v) => updateField('errorHandling.forfeitThreshold', v)} error={errors['errorHandling.forfeitThreshold']}
        />
        <ConfigField
          label="Max Tokens (Chunking)" description="Maximum tokens per chunk" type="number"
          value={getNestedValue(config, 'chunking.maxTokens') ?? 8000}
          onChange={(v) => updateField('chunking.maxTokens', v)} error={errors['chunking.maxTokens']}
        />
      </div>
    </ConfigSection>
  );
}

// ============================================================================
// Notifications
// ============================================================================

export function NotificationsSection({ config, errors, updateField, getNestedValue }: SectionProps): React.JSX.Element {
  return (
    <ConfigSection title="Notifications" description="Discord and Slack webhook settings">
      <div className="config-fields-grid">
        <ConfigField
          label="Auto Notify" description="Automatically send notifications after review" type="boolean"
          value={getNestedValue(config, 'notifications.autoNotify') ?? false}
          onChange={(v) => updateField('notifications.autoNotify', v)}
        />
        <ConfigField
          label="Discord Webhook URL" description="Discord notification webhook" type="text"
          value={getNestedValue(config, 'notifications.discord.webhookUrl') ?? ''}
          onChange={(v) => updateField('notifications.discord.webhookUrl', v)}
          placeholder="https://discord.com/api/webhooks/..." error={errors['notifications.discord.webhookUrl']}
        />
        <ConfigField
          label="Slack Webhook URL" description="Slack notification webhook" type="text"
          value={getNestedValue(config, 'notifications.slack.webhookUrl') ?? ''}
          onChange={(v) => updateField('notifications.slack.webhookUrl', v)}
          placeholder="https://hooks.slack.com/services/..." error={errors['notifications.slack.webhookUrl']}
        />
      </div>
    </ConfigSection>
  );
}

// ============================================================================
// GitHub
// ============================================================================

export function GitHubSection({ config, errors, updateField, getNestedValue }: SectionProps): React.JSX.Element {
  return (
    <ConfigSection title="GitHub" description="GitHub integration settings">
      <div className="config-fields-grid">
        <ConfigField
          label="Post Suggestions" description="Post review suggestions as GitHub comments" type="boolean"
          value={getNestedValue(config, 'github.postSuggestions') ?? true}
          onChange={(v) => updateField('github.postSuggestions', v)}
        />
        <ConfigField
          label="Collapse Discussions" description="Collapse discussion details in PR comments" type="boolean"
          value={getNestedValue(config, 'github.collapseDiscussions') ?? true}
          onChange={(v) => updateField('github.collapseDiscussions', v)}
        />
        <ConfigField
          label="Needs Human Label" description="Label for PRs requiring human review" type="text"
          value={getNestedValue(config, 'github.needsHumanLabel') ?? 'needs-human-review'}
          onChange={(v) => updateField('github.needsHumanLabel', v)} error={errors['github.needsHumanLabel']}
        />
        <ConfigField
          label="Human Reviewers" description="GitHub usernames for human review assignment" type="array"
          value={getNestedValue(config, 'github.humanReviewers') ?? []}
          onChange={(v) => updateField('github.humanReviewers', v)} placeholder="Add GitHub username..."
        />
        <ConfigField
          label="Human Teams" description="GitHub teams for human review assignment" type="array"
          value={getNestedValue(config, 'github.humanTeams') ?? []}
          onChange={(v) => updateField('github.humanTeams', v)} placeholder="Add GitHub team..."
        />
        <ConfigField
          label="SARIF Output Path" description="Path for SARIF report output" type="text"
          value={getNestedValue(config, 'github.sarifOutputPath') ?? ''}
          onChange={(v) => updateField('github.sarifOutputPath', v)} placeholder="e.g. results.sarif"
        />
      </div>
    </ConfigSection>
  );
}

// ============================================================================
// Auto-Approve
// ============================================================================

export function AutoApproveSection({ config, errors, updateField, getNestedValue }: SectionProps): React.JSX.Element {
  return (
    <ConfigSection title="Auto-Approve" description="Automatic approval for low-risk changes">
      <div className="config-fields-grid">
        <ConfigField
          label="Enabled" description="Enable auto-approval" type="boolean"
          value={getNestedValue(config, 'autoApprove.enabled') ?? false}
          onChange={(v) => updateField('autoApprove.enabled', v)}
        />
        <ConfigField
          label="Max Lines" description="Maximum changed lines for auto-approval" type="number"
          value={getNestedValue(config, 'autoApprove.maxLines') ?? 50}
          onChange={(v) => updateField('autoApprove.maxLines', v)} error={errors['autoApprove.maxLines']}
        />
        <ConfigField
          label="Allowed File Patterns" description="Glob patterns eligible for auto-approval" type="array"
          value={getNestedValue(config, 'autoApprove.allowedFilePatterns') ?? []}
          onChange={(v) => updateField('autoApprove.allowedFilePatterns', v)} placeholder="e.g. *.md, *.txt"
        />
      </div>
    </ConfigSection>
  );
}
