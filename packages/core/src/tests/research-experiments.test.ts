import { describe, expect, it } from 'vitest';
import { formatResearchExperimentsMarkdown, getResearchExperiments } from '../research/experiments.js';

describe('research backlog experiments', () => {
  it('defines one small proof plan for each Phase 5 issue', () => {
    const experiments = getResearchExperiments();
    expect(experiments.map((e) => e.issue)).toEqual(['#466', '#469', '#471', '#481']);
    for (const experiment of experiments) {
      expect(experiment.smallestProof).toBeTruthy();
      expect(experiment.requiredEvidence.length).toBeGreaterThan(0);
      expect(experiment.guardrails.join(' ')).toMatch(/Do not|No live|Keep/i);
    }
  });

  it('formats a markdown report with gates and guardrails', () => {
    const markdown = formatResearchExperimentsMarkdown();
    expect(markdown).toContain('# Research Backlog Experiments');
    expect(markdown).toContain('## #466 Binary internal severity');
    expect(markdown).toContain('Recommended gate:');
    expect(markdown).toContain('Guardrails:');
  });
});
