import { EventEmitter } from "events";
class ProgressEmitter extends EventEmitter {
  currentStage = "init";
  stageProgress = 0;
  emitProgress(event) {
    const full = { ...event, timestamp: Date.now() };
    this.currentStage = event.stage;
    this.stageProgress = event.progress;
    try {
      this.emit("progress", full);
    } catch {
    }
  }
  stageStart(stage, message) {
    this.emitProgress({ stage, event: "stage-start", progress: 0, message });
  }
  stageUpdate(stage, progress, message, details) {
    this.emitProgress({ stage, event: "stage-update", progress, message, details });
  }
  stageComplete(stage, message) {
    this.emitProgress({ stage, event: "stage-complete", progress: 100, message });
  }
  stageError(stage, error) {
    this.emitProgress({
      stage,
      event: "stage-error",
      progress: this.stageProgress,
      message: error,
      details: { error }
    });
  }
  pipelineComplete(message) {
    this.emitProgress({ stage: "complete", event: "pipeline-complete", progress: 100, message });
  }
  getCurrentStage() {
    return this.currentStage;
  }
  getProgress() {
    return this.stageProgress;
  }
  onProgress(listener) {
    return this.on("progress", listener);
  }
}
const BAR_WIDTH = 10;
function buildBar(progress) {
  const filled = Math.round(Math.min(100, Math.max(0, progress)) / 100 * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return "[" + "\u25A0".repeat(filled) + "\u25A1".repeat(empty) + "]";
}
const STAGE_LABELS = {
  init: "Init",
  review: "L1 Review",
  discuss: "L2 Discussion",
  verdict: "L3 Verdict",
  complete: "Complete"
};
function formatProgressLine(event) {
  const label = STAGE_LABELS[event.stage] ?? event.stage;
  if (event.event === "stage-error") {
    const errorMsg = event.details?.error ?? event.message;
    const reviewerPart = event.details?.reviewerId ? ` reviewer ${event.details.reviewerId} failed:` : "";
    return `[ERROR] ${label} \u2014${reviewerPart} ${errorMsg}`;
  }
  const bar = buildBar(event.progress);
  const pct = `${event.progress}%`;
  return `${bar} ${pct} ${label} \u2014 ${event.message}`;
}
function formatProgressJson(event) {
  return JSON.stringify(event);
}
export {
  ProgressEmitter,
  formatProgressJson,
  formatProgressLine
};
