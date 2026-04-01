import { createOctokit } from "./client.js";
async function fetchPrDiff(config, prNumber, octokit) {
  const kit = octokit ?? createOctokit(config);
  const { data: pr } = await kit.pulls.get({
    owner: config.owner,
    repo: config.repo,
    pull_number: prNumber
  });
  const diffResponse = await kit.pulls.get({
    owner: config.owner,
    repo: config.repo,
    pull_number: prNumber,
    mediaType: { format: "diff" }
  });
  const diff = diffResponse.data;
  const diffContent = typeof diff === "string" ? diff : "";
  const MAX_DIFF_SIZE = 5e5;
  if (diffContent.length >= MAX_DIFF_SIZE) {
    console.warn("[GitHub] Diff may be truncated (>500KB). Some files may be missing from review.");
  }
  return {
    number: pr.number,
    title: pr.title,
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    diff: diffContent
  };
}
export {
  fetchPrDiff
};
