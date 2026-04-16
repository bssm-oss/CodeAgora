import { readFile } from "fs/promises";
import path from "path";
import { validateDiffPath } from "@codeagora/shared/utils/path-validation.js";
function selectSupporters(poolConfig) {
  const { pool, pickCount, devilsAdvocate, personaPool } = poolConfig;
  const enabledPool = pool.filter((s) => s.enabled);
  if (enabledPool.length < pickCount) {
    throw new Error(
      `Insufficient enabled supporters: ${enabledPool.length} available, ${pickCount} required`
    );
  }
  const selectedFromPool = randomPick(enabledPool, pickCount);
  const withPersonas = selectedFromPool.map((supporter) => ({
    ...supporter,
    assignedPersona: randomElement(personaPool)
  }));
  const supporters = [];
  if (devilsAdvocate.enabled) {
    supporters.push({
      ...devilsAdvocate,
      assignedPersona: devilsAdvocate.persona
    });
  }
  supporters.push(...withPersonas);
  return supporters;
}
function randomPick(array, count) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}
function randomElement(array) {
  if (array.length === 0) return void 0;
  return array[Math.floor(Math.random() * array.length)];
}
async function loadPersona(personaPath) {
  try {
    if (personaPath.startsWith("builtin:")) {
      const { getBuiltinPersona } = await import("../l1/builtin-personas.js");
      const content2 = getBuiltinPersona(personaPath.slice(8));
      if (content2) return content2;
      console.warn(`[Persona] Unknown built-in persona: ${personaPath.slice(8)}`);
      return "";
    }
    if (!personaPath.includes("/") && !personaPath.includes("\\") && !personaPath.endsWith(".md") && !personaPath.endsWith(".txt")) {
      return personaPath.trim();
    }
    if (path.isAbsolute(personaPath)) {
      console.warn(`[Persona] Absolute path blocked: ${personaPath}`);
      return "";
    }
    const projectRoot = process.cwd();
    const result = validateDiffPath(personaPath, { allowedRoots: [projectRoot] });
    if (!result.success) {
      console.warn(`[Persona] Path validation failed: ${result.error}`);
      return "";
    }
    const content = await readFile(result.data, "utf-8");
    return content.trim();
  } catch (error) {
    console.warn(`[Persona] Failed to load ${personaPath}:`, error instanceof Error ? error.message : error);
    return "";
  }
}
export {
  loadPersona,
  selectSupporters
};
