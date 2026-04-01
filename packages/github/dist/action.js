#!/usr/bin/env node
import fs from "fs/promises";
import { appendFileSync } from "fs";
import { runPipeline } from "@codeagora/core/pipeline/orchestrator.js";
import { buildDiffPositionIndex } from "./diff-parser.js";
import { mapToGitHubReview } from "./mapper.js";
import { postReview, setCommitStatus, handleNeedsHuman } from "./poster.js";
import { createAppOctokit } from "./client.js";
import { buildSarifReport, serializeSarif } from "./sarif.js";
import { loadConfig } from "@codeagora/core/config/loader.js";
import { validateDiffPath } from "@codeagora/shared/utils/path-validation.js";
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--") && i + 1 < argv.length) {
      args[arg.slice(2)] = argv[i + 1];
      i++;
    }
  }
  const diff = args["diff"];
  const pr = parseInt(args["pr"] ?? "", 10);
  const sha = args["sha"] ?? "";
  const repo = args["repo"] ?? "";
  const token = process.env["GITHUB_TOKEN"] ?? "";
  const failOnReject = args["fail-on-reject"] !== "false";
  const maxDiffLines = parseInt(args["max-diff-lines"] ?? "5000", 10);
  if (!diff) throw new Error("--diff is required");
  if (isNaN(pr)) throw new Error("--pr must be a valid number");
  if (!sha) throw new Error("--sha is required");
  if (!repo || !repo.includes("/")) throw new Error("--repo must be in owner/repo format");
  if (!token) throw new Error("GITHUB_TOKEN environment variable is required");
  return { diff, pr, sha, repo, token, failOnReject, maxDiffLines };
}
async function main() {
  const inputs = parseArgs(process.argv);
  const [owner, repo] = inputs.repo.split("/");
  if (!owner || !repo) {
    console.error("Error: --repo must be in <owner>/<repo> format");
    process.exit(1);
  }
  if (inputs.maxDiffLines > 0) {
    const diffContent2 = await fs.readFile(inputs.diff, "utf-8");
    const lineCount = diffContent2.split("\n").length;
    if (lineCount > inputs.maxDiffLines) {
      console.log(`::warning::Diff has ${lineCount} lines (limit: ${inputs.maxDiffLines}). Skipping review.`);
      setActionOutput("verdict", "SKIPPED");
      return;
    }
  }
  console.log("::group::Running CodeAgora review pipeline");
  const result = await runPipeline({ diffPath: inputs.diff });
  console.log("::endgroup::");
  if (result.status === "error") {
    console.error(`::error::Pipeline failed: ${result.error}`);
    process.exit(2);
  }
  if (!result.summary) {
    console.log("No issues found.");
    setActionOutput("verdict", "ACCEPT");
    setActionOutput("session-id", result.sessionId);
    return;
  }
  const diffContent = await fs.readFile(inputs.diff, "utf-8");
  const positionIndex = buildDiffPositionIndex(diffContent);
  const evidenceDocs = result.evidenceDocs ?? [];
  const discussions = result.discussions ?? [];
  const reviewerMap = result.reviewerMap ? new Map(Object.entries(result.reviewerMap)) : void 0;
  const reviewerOpinions = result.reviewerOpinions ? new Map(Object.entries(result.reviewerOpinions)) : void 0;
  const ghConfig = { token: inputs.token, owner, repo };
  console.log("::group::Posting review to GitHub");
  const review = mapToGitHubReview({
    summary: result.summary,
    evidenceDocs,
    discussions,
    positionIndex,
    headSha: inputs.sha,
    sessionId: result.sessionId,
    sessionDate: result.date,
    reviewerMap,
    reviewerOpinions,
    devilsAdvocateId: result.devilsAdvocateId,
    supporterModelMap: result.supporterModelMap ? new Map(Object.entries(result.supporterModelMap)) : void 0
  });
  const appKit = await createAppOctokit(owner, repo);
  if (appKit) console.log("Using GitHub App authentication (CodeAgora Bot)");
  const postResult = await postReview(ghConfig, inputs.pr, review, appKit ?? void 0);
  await setCommitStatus(ghConfig, inputs.sha, postResult.verdict, postResult.reviewUrl);
  const config = await loadConfig().catch(() => null);
  if (postResult.verdict === "NEEDS_HUMAN") {
    const ghIntegration = config?.github;
    await handleNeedsHuman(ghConfig, inputs.pr, {
      humanReviewers: ghIntegration?.humanReviewers,
      humanTeams: ghIntegration?.humanTeams,
      needsHumanLabel: ghIntegration?.needsHumanLabel
    });
  }
  const rawSarifPath = config?.github?.sarifOutputPath ?? "/tmp/codeagora-results.sarif";
  const sarifValidation = validateDiffPath(rawSarifPath, {
    allowedRoots: [process.cwd(), "/tmp"]
  });
  if (sarifValidation.success) {
    const sarifReport = buildSarifReport(evidenceDocs, result.sessionId, result.date);
    await fs.writeFile(sarifValidation.data, serializeSarif(sarifReport));
    console.log(`SARIF report written to ${sarifValidation.data}`);
  } else {
    console.error(`::warning::SARIF output path rejected: ${sarifValidation.error}`);
  }
  console.log("::endgroup::");
  setActionOutput("verdict", result.summary.decision);
  setActionOutput("review-url", postResult.reviewUrl);
  setActionOutput("session-id", result.sessionId);
  console.log(`Review posted: ${postResult.reviewUrl}`);
  console.log(`Verdict: ${result.summary.decision}`);
  if (result.summary.decision === "REJECT" && inputs.failOnReject) {
    process.exit(1);
  }
}
function setActionOutput(name, value) {
  const outputFile = process.env["GITHUB_OUTPUT"];
  if (outputFile) {
    if (value.includes("\n")) {
      const delimiter = `EOF_${Date.now()}`;
      appendFileSync(outputFile, `${name}<<${delimiter}
${value}
${delimiter}
`);
    } else {
      appendFileSync(outputFile, `${name}=${value}
`);
    }
  } else {
    console.log(`::set-output name=${name}::${value}`);
  }
}
main().catch((err) => {
  console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
