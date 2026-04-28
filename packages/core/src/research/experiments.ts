export type ResearchIssue = '#466' | '#469' | '#471' | '#481';

export interface ResearchExperiment {
  issue: ResearchIssue;
  title: string;
  hypothesis: string;
  smallestProof: string;
  requiredEvidence: string[];
  guardrails: string[];
  recommendedGate: string;
}

export function getResearchExperiments(): ResearchExperiment[] {
  return [
    {
      issue: '#466',
      title: 'Binary internal severity',
      hypothesis: 'A binary internal severity can reduce borderline severity churn without lowering recall.',
      smallestProof: 'Run the 20-fixture benchmark with severity collapsed to actionable/non-actionable in report-only mode.',
      requiredEvidence: ['precision', 'recall', 'F1', 'false rejects', 'false accepts'],
      guardrails: ['Do not change public severity output before benchmark evidence exists.'],
      recommendedGate: 'pnpm bench:fn -- --results <candidate-results>',
    },
    {
      issue: '#469',
      title: 'Ambiguous-case calibration dataset',
      hypothesis: 'Dedicated ambiguous fixtures improve NEEDS_HUMAN routing without hiding true positives.',
      smallestProof: 'Add 5 ambiguous held-out fixtures and compare L3 decisions against current 20-fixture gate.',
      requiredEvidence: ['NEEDS_HUMAN rate', 'false reject rate', 'human-question quality'],
      guardrails: ['Keep ambiguous fixtures separate from golden-bug recall fixtures.'],
      recommendedGate: 'pnpm bench:fn -- --validate-only',
    },
    {
      issue: '#471',
      title: 'Cross-file interaction review',
      hypothesis: 'A small interaction graph catches cross-file bugs that import impact analysis only hints at.',
      smallestProof: 'Generate a TouchGraph report artifact for changed symbols without adding a new reviewer path.',
      requiredEvidence: ['cross-file TP count', 'extra FP count', 'token overhead'],
      guardrails: ['Do not add InteractionReviewer until benchmark fixtures demonstrate missed cross-file bugs.'],
      recommendedGate: 'pnpm exec vitest run packages/core/src/tests/impact-analyzer.test.ts',
    },
    {
      issue: '#481',
      title: 'Bandit exploration beyond configured pool',
      hypothesis: 'Catalog exploration can find cheaper equivalent models after rate-limit and cost metrics are stable.',
      smallestProof: 'Run read-only catalog scoring against metrics artifacts; do not mutate reviewer config automatically.',
      requiredEvidence: ['cost delta', 'latency delta', 'quality delta', 'rate-limit errors'],
      guardrails: ['No live model swap without passing the reference benchmark gate.'],
      recommendedGate: 'pnpm bench:reference -- --results <candidate-results>',
    },
  ];
}

export function formatResearchExperimentsMarkdown(experiments = getResearchExperiments()): string {
  const lines = ['# Research Backlog Experiments', ''];
  for (const experiment of experiments) {
    lines.push(`## ${experiment.issue} ${experiment.title}`);
    lines.push('');
    lines.push(`Hypothesis: ${experiment.hypothesis}`);
    lines.push(`Smallest proof: ${experiment.smallestProof}`);
    lines.push(`Recommended gate: \`${experiment.recommendedGate}\``);
    lines.push('');
    lines.push('Required evidence:');
    for (const item of experiment.requiredEvidence) lines.push(`- ${item}`);
    lines.push('');
    lines.push('Guardrails:');
    for (const item of experiment.guardrails) lines.push(`- ${item}`);
    lines.push('');
  }
  return lines.join('\n');
}
