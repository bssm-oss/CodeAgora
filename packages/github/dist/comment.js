import { createOctokit } from "./client.js";
async function postPrComment(config, prNumber, body, octokit) {
  const kit = octokit ?? createOctokit(config);
  const { data } = await kit.issues.createComment({
    owner: config.owner,
    repo: config.repo,
    issue_number: prNumber,
    body
  });
  return { id: data.id, url: data.html_url };
}
async function findExistingComment(config, prNumber, marker, octokit) {
  const kit = octokit ?? createOctokit(config);
  const comments = await kit.paginate(kit.issues.listComments, {
    owner: config.owner,
    repo: config.repo,
    issue_number: prNumber,
    per_page: 100
  });
  const found = comments.find((c) => c.body?.includes(marker));
  return found ? { id: found.id } : null;
}
async function updatePrComment(config, commentId, body, octokit) {
  const kit = octokit ?? createOctokit(config);
  await kit.issues.updateComment({
    owner: config.owner,
    repo: config.repo,
    comment_id: commentId,
    body
  });
}
export {
  findExistingComment,
  postPrComment,
  updatePrComment
};
