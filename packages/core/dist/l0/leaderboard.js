import { BanditStore } from "./bandit-store.js";
async function getModelLeaderboard() {
  const store = new BanditStore();
  await store.load();
  const arms = store.getAllArms();
  const entries = [];
  for (const [model, arm] of arms.entries()) {
    const winRate = arm.alpha / (arm.alpha + arm.beta);
    entries.push({
      model,
      winRate,
      reviews: arm.reviewCount,
      alpha: arm.alpha,
      beta: arm.beta
    });
  }
  entries.sort((a, b) => b.winRate - a.winRate);
  return entries;
}
function formatLeaderboard(entries) {
  if (entries.length === 0) {
    return "No model data yet. Run some reviews first.";
  }
  const lines = [];
  lines.push("Model Leaderboard (.ca/model-quality.json)");
  lines.push("");
  lines.push("  #  \u2502 Model                              \u2502 Win Rate \u2502 Reviews \u2502 \u03B1/\u03B2");
  lines.push("  \u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const rank = String(i + 1).padStart(3);
    const model = e.model.padEnd(33);
    const wr = `${(e.winRate * 100).toFixed(1)}%`.padStart(8);
    const rev = String(e.reviews).padStart(7);
    const ab = `${e.alpha.toFixed(0)}/${e.beta.toFixed(0)}`;
    lines.push(`  ${rank} \u2502 ${model} \u2502 ${wr} \u2502 ${rev} \u2502 ${ab}`);
  }
  lines.push("");
  lines.push("  Win rate = \u03B1 / (\u03B1 + \u03B2) from Thompson Sampling arms");
  return lines.join("\n");
}
export {
  formatLeaderboard,
  getModelLeaderboard
};
