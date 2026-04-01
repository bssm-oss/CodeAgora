import { createOctokit } from "./client.js";
const MARKER = "<!-- codeagora-v3 -->";
async function findPriorReviews(config, prNumber, octokit) {
  const kit = octokit ?? createOctokit(config);
  const reviews = await kit.paginate(kit.pulls.listReviews, {
    owner: config.owner,
    repo: config.repo,
    pull_number: prNumber,
    per_page: 100
  });
  return reviews.filter((r) => r.body?.includes(MARKER)).map((r) => r.id);
}
async function dismissPriorReviews(config, prNumber, reviewIds, octokit) {
  const kit = octokit ?? createOctokit(config);
  let dismissed = 0;
  let failed = 0;
  for (const reviewId of reviewIds) {
    try {
      await kit.pulls.dismissReview({
        owner: config.owner,
        repo: config.repo,
        pull_number: prNumber,
        review_id: reviewId,
        message: "Superseded by new CodeAgora run"
      });
      dismissed++;
    } catch {
      failed++;
    }
  }
  return { dismissed, failed };
}
export {
  dismissPriorReviews,
  findPriorReviews
};
