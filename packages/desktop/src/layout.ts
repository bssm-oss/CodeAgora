export const mobileViewportMaxWidth = 760;

export type SessionMobileTab = 'history' | 'detail';
export type RunMobileStep = 1 | 2 | 3;

export function isCompactMobileViewport(width: number): boolean {
  return width <= mobileViewportMaxWidth;
}

export function resolveRunMobileStep(requestedStep: RunMobileStep, ready: boolean, hasRun: boolean): RunMobileStep {
  const maxStep: RunMobileStep = ready ? (hasRun ? 3 : 2) : 1;
  return Math.min(requestedStep, maxStep) as RunMobileStep;
}
