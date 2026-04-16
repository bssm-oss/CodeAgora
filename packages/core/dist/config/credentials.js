import { readFile, writeFile, mkdir, stat } from "fs/promises";
import path from "path";
import os from "os";
const CONFIG_DIR = path.join(os.homedir(), ".config", "codeagora");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "credentials");
async function loadCredentials() {
  let content;
  try {
    if (!await checkFilePermissions(CREDENTIALS_PATH, 384)) {
      return;
    }
    content = await readFile(CREDENTIALS_PATH, "utf-8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
async function saveCredential(key, value) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 448 });
  const sanitized = value.replace(/[\r\n]/g, "");
  let lines = [];
  try {
    const existing = await readFile(CREDENTIALS_PATH, "utf-8");
    lines = existing.split("\n");
  } catch {
  }
  const idx = lines.findIndex((l) => {
    const eqIdx = l.indexOf("=");
    return eqIdx >= 0 && l.slice(0, eqIdx).trim() === key;
  });
  if (idx >= 0) {
    lines[idx] = `${key}=${sanitized}`;
  } else {
    lines.push(`${key}=${sanitized}`);
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  await writeFile(CREDENTIALS_PATH, lines.join("\n") + "\n", { mode: 384 });
}
function getCredentialsPath() {
  return CREDENTIALS_PATH;
}
async function checkFilePermissions(filePath, expectedMode) {
  if (process.platform === "win32") return true;
  try {
    const s = await stat(filePath);
    const actualMode = s.mode & 511;
    if (actualMode !== expectedMode) {
      const actual = `0o${actualMode.toString(8)}`;
      const expected = `0o${expectedMode.toString(8)}`;
      console.warn(
        `[Security] ${filePath} has permissions ${actual}, expected ${expected}. Fix with: chmod ${expectedMode.toString(8)} "${filePath}"`
      );
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
export {
  checkFilePermissions,
  getCredentialsPath,
  loadCredentials,
  saveCredential
};
