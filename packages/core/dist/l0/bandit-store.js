import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { z } from "zod";
const BanditArmSchema = z.object({
  alpha: z.number(),
  beta: z.number(),
  reviewCount: z.number(),
  lastUsed: z.number()
});
const BanditStoreDataSchema = z.object({
  version: z.number(),
  lastUpdated: z.string(),
  arms: z.record(z.string(), BanditArmSchema),
  history: z.array(z.object({
    reviewId: z.string(),
    diffId: z.string(),
    modelId: z.string(),
    provider: z.string(),
    timestamp: z.number(),
    issuesRaised: z.number(),
    specificityScore: z.number(),
    peerValidationRate: z.number().nullable(),
    headAcceptanceRate: z.number().nullable(),
    compositeQ: z.number().nullable(),
    rewardSignal: z.union([z.literal(0), z.literal(1), z.null()])
  }))
});
class BanditStore {
  data;
  filePath;
  constructor(filePath) {
    this.filePath = filePath ?? path.join(process.cwd(), ".ca", "model-quality.json");
    this.data = {
      version: 1,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      arms: {},
      history: []
    };
  }
  async load() {
    try {
      const content = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(content);
      this.data = BanditStoreDataSchema.parse(parsed);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.warn("[BanditStore] Invalid data file, using defaults:", error.message);
      }
    }
  }
  async save() {
    this.data.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }
  getArm(key) {
    return this.data.arms[key];
  }
  getAllArms() {
    return new Map(Object.entries(this.data.arms));
  }
  updateArm(key, reward) {
    const arm = this.data.arms[key] ?? {
      alpha: 1,
      beta: 1,
      reviewCount: 0,
      lastUsed: 0
    };
    if (reward === 1) {
      arm.alpha += 1;
    } else {
      arm.beta += 1;
    }
    arm.reviewCount += 1;
    arm.lastUsed = Date.now();
    this.data.arms[key] = arm;
  }
  /**
   * Warm-start a new model version from an old arm's prior (50% decay).
   */
  warmStart(oldKey, newKey) {
    const oldArm = this.data.arms[oldKey];
    if (!oldArm) return;
    this.data.arms[newKey] = {
      alpha: Math.round(oldArm.alpha * 0.5) + 1,
      beta: Math.round(oldArm.beta * 0.5) + 1,
      reviewCount: 0,
      lastUsed: Date.now()
    };
  }
  addHistory(record, maxHistory = 1e3) {
    this.data.history.push(record);
    if (this.data.history.length > maxHistory) {
      this.data.history = this.data.history.slice(-maxHistory);
    }
  }
  getHistory() {
    return this.data.history;
  }
  getData() {
    return this.data;
  }
}
export {
  BanditStore
};
