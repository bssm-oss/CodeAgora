import { createOctokit } from "./client.js";
import { findPriorReviews, dismissPriorReviews } from "./dedup.js";
const MAX_COMMENTS_PER_REVIEW = 50;
async function postReview(config, prNumber, review, octokit) {
  const kit = octokit ?? createOctokit(config);
  const priorIds = await findPriorReviews(config, prNumber, kit);
  if (priorIds.length > 0) {
    await dismissPriorReviews(config, prNumber, priorIds, kit);
  }
  if (review.comments.length > MAX_COMMENTS_PER_REVIEW) {
    console.warn(`[GitHub] Truncating ${review.comments.length} comments to ${MAX_COMMENTS_PER_REVIEW} (MAX_INLINE_COMMENTS limit)`);
  }
  const comments = review.comments.slice(0, MAX_COMMENTS_PER_REVIEW);
  const inlineComments = comments.filter((c) => c.position !== void 0).map((c) => ({
    path: c.path,
    position: c.position,
    body: c.body
  }));
  let data;
  try {
    const response = await kit.pulls.createReview({
      owner: config.owner,
      repo: config.repo,
      pull_number: prNumber,
      commit_id: review.commit_id,
      event: review.event,
      body: review.body,
      comments: inlineComments
    });
    data = response.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err.status;
    if (status === 422 || message.includes("position") || message.includes("Unprocessable")) {
      const response = await kit.pulls.createReview({
        owner: config.owner,
        repo: config.repo,
        pull_number: prNumber,
        commit_id: review.commit_id,
        event: review.event,
        body: review.body,
        comments: []
      });
      data = response.data;
    } else {
      throw err;
    }
  }
  const fileLevelComments = comments.filter((c) => c.position === void 0);
  for (const comment of fileLevelComments) {
    await kit.issues.createComment({
      owner: config.owner,
      repo: config.repo,
      issue_number: prNumber,
      body: comment.body
    }).catch((err) => {
      console.warn(`[GitHub] Failed to post file-level comment: ${err instanceof Error ? err.message : err}`);
    });
  }
  let verdict;
  if (review.event === "REQUEST_CHANGES") {
    verdict = "REJECT";
  } else if (review.body.includes("NEEDS HUMAN REVIEW")) {
    verdict = "NEEDS_HUMAN";
  } else {
    verdict = "ACCEPT";
  }
  return {
    reviewId: data.id,
    reviewUrl: data.html_url,
    verdict
  };
}
async function handleNeedsHuman(config, prNumber, options, octokit) {
  const kit = octokit ?? createOctokit(config);
  const reviewers = options.humanReviewers ?? [];
  const teams = options.humanTeams ?? [];
  if (reviewers.length > 0 || teams.length > 0) {
    await kit.pulls.requestReviewers({
      owner: config.owner,
      repo: config.repo,
      pull_number: prNumber,
      reviewers,
      team_reviewers: teams
    }).catch(() => {
    });
  }
  const label = options.needsHumanLabel ?? "needs-human-review";
  await kit.issues.addLabels({
    owner: config.owner,
    repo: config.repo,
    issue_number: prNumber,
    labels: [label]
  }).catch(() => {
  });
}
async function setCommitStatus(config, sha, verdict, reviewUrl, octokit) {
  const kit = octokit ?? createOctokit(config);
  const stateMap = {
    ACCEPT: "success",
    REJECT: "failure",
    NEEDS_HUMAN: "pending"
  };
  const descriptionMap = {
    ACCEPT: "All issues resolved \u2014 ready to merge",
    REJECT: "Blocking issues found",
    NEEDS_HUMAN: "Human review required for unresolved issues"
  };
  await kit.repos.createCommitStatus({
    owner: config.owner,
    repo: config.repo,
    sha,
    state: stateMap[verdict] ?? "pending",
    context: "CodeAgora / review",
    description: descriptionMap[verdict] ?? "Review complete",
    target_url: reviewUrl
  });
}
export {
  handleNeedsHuman,
  postReview,
  setCommitStatus
};
