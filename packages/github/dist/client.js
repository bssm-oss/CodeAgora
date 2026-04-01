import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { readFileSync } from "fs";
function createOctokit(config) {
  return new Octokit({ auth: config.token });
}
async function createAppOctokit(owner, repo) {
  const appId = process.env["CODEAGORA_APP_ID"];
  const privateKeyRaw = process.env["CODEAGORA_APP_PRIVATE_KEY"];
  const privateKeyPath = process.env["CODEAGORA_APP_PRIVATE_KEY_PATH"];
  if (!appId) return null;
  let privateKey;
  if (privateKeyRaw) {
    privateKey = privateKeyRaw;
  } else if (privateKeyPath) {
    try {
      const resolvedPath = privateKeyPath.replace(/^~/, process.env["HOME"] ?? "");
      privateKey = readFileSync(resolvedPath, "utf-8");
    } catch {
      console.warn("[GitHub App] Failed to read private key from path");
      return null;
    }
  } else {
    return null;
  }
  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: Number(appId), privateKey }
  });
  try {
    const { data: installation } = await appOctokit.apps.getRepoInstallation({ owner, repo });
    return new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: Number(appId), privateKey, installationId: installation.id }
    });
  } catch {
    console.warn(`[GitHub App] No installation found for ${owner}/${repo}`);
    return null;
  }
}
function parsePrUrl(url) {
  const match = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec(url);
  if (!match) return null;
  const [, owner, repo, numStr] = match;
  const number = parseInt(numStr, 10);
  if (isNaN(number)) return null;
  return { owner, repo, number };
}
function parseGitRemote(remoteUrl) {
  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(remoteUrl);
  if (sshMatch) {
    const [, owner, repo] = sshMatch;
    return { owner, repo };
  }
  const httpsMatch = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl);
  if (httpsMatch) {
    const [, owner, repo] = httpsMatch;
    return { owner, repo };
  }
  return null;
}
function createGitHubConfig(options) {
  const token = options.token ?? process.env["GITHUB_TOKEN"];
  if (!token) {
    throw new Error(
      "GitHub token is required. Pass --token or set the GITHUB_TOKEN environment variable."
    );
  }
  if (options.prUrl) {
    const parsed = parsePrUrl(options.prUrl);
    if (!parsed) {
      throw new Error(`Invalid GitHub PR URL: ${options.prUrl}`);
    }
    return { token, owner: parsed.owner, repo: parsed.repo, prNumber: parsed.number };
  }
  if (options.remoteUrl && options.prNumber !== void 0) {
    const parsed = parseGitRemote(options.remoteUrl);
    if (!parsed) {
      throw new Error(`Could not parse git remote URL: ${options.remoteUrl}`);
    }
    return { token, owner: parsed.owner, repo: parsed.repo, prNumber: options.prNumber };
  }
  throw new Error(
    "Either prUrl or both remoteUrl and prNumber must be provided."
  );
}
export {
  createAppOctokit,
  createGitHubConfig,
  createOctokit,
  parseGitRemote,
  parsePrUrl
};
