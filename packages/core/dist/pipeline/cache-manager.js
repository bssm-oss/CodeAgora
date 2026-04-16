import { lookupCache, addToCache } from "@codeagora/shared/utils/cache.js";
import { CA_ROOT } from "@codeagora/shared/utils/fs.js";
import { computeHash } from "@codeagora/shared/utils/hash.js";
import fs from "fs/promises";
function computeCacheKey(diffContent, config) {
  return computeHash(diffContent + JSON.stringify(config));
}
async function checkAndLoadCache(cacheKey, session) {
  try {
    const cachedSessionPath = await lookupCache(CA_ROOT, cacheKey);
    if (cachedSessionPath) {
      const [cachedDate, cachedId] = cachedSessionPath.split("/");
      if (cachedDate && cachedId) {
        const cachedResultPath = `${CA_ROOT}/sessions/${cachedDate}/${cachedId}/result.json`;
        const cachedRaw = await fs.readFile(cachedResultPath, "utf-8");
        const cachedResult = JSON.parse(cachedRaw);
        await session.setStatus("completed");
        return { ...cachedResult, cached: true };
      }
    }
  } catch {
  }
  return null;
}
async function persistResultCache(date, sessionId, cacheKey, pipelineResult, noCache) {
  try {
    const resultJsonPath = `${CA_ROOT}/sessions/${date}/${sessionId}/result.json`;
    await fs.writeFile(resultJsonPath, JSON.stringify(pipelineResult, null, 2), "utf-8");
    if (!noCache) {
      await addToCache(CA_ROOT, cacheKey, `${date}/${sessionId}`);
    }
  } catch {
  }
}
export {
  checkAndLoadCache,
  computeCacheKey,
  persistResultCache
};
