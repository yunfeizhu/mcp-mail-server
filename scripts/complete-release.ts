import assert from 'node:assert/strict';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { synchronizeReleaseDocuments, type ReleaseDocuments } from './release-notes';
import { verifyReleaseMetadata } from './verify-release';

const repository = 'yunfeizhu/mcp-mail-server';
const root = `/repos/${repository}`;
const releaseBranch = 'release-please--branches--main--components--mcp-mail-server';

export type GitHubRequest = (
  route: string,
  method?: 'GET' | 'POST' | 'PATCH',
  body?: unknown,
) => Promise<unknown>;

interface PullRequest {
  number: number;
  node_id: string;
  state: string;
  draft: boolean;
  user: { login: string };
  labels: { name: string }[];
  base: { ref: string; repo: { full_name: string } };
  head: { ref: string; sha: string; repo: { full_name: string } };
}

interface WorkflowRun {
  id: number;
  head_sha: string;
  head_branch: string;
  event: string;
  status: string;
  conclusion: string | null;
  html_url: string;
}

async function request<T>(
  api: GitHubRequest,
  route: string,
  method?: 'GET' | 'POST' | 'PATCH',
  body?: unknown,
): Promise<T> {
  const result = await api(route, method, body);
  if (route === '/graphql') {
    assert.ok(
      !(result as { errors?: unknown[] }).errors?.length,
      'GitHub GraphQL operation failed',
    );
  }
  return result as T;
}

async function getReleasePullRequest(api: GitHubRequest, number: number): Promise<PullRequest> {
  assert.ok(Number.isSafeInteger(number) && number > 0, 'Invalid release PR number');
  const pr = await request<PullRequest>(api, `${root}/pulls/${number}`);
  assert.equal(pr.state, 'open', 'Release PR must still be open');
  assert.equal(
    pr.user.login,
    'github-actions[bot]',
    'Only Actions-created release PRs are supported',
  );
  assert.equal(pr.base.repo.full_name, repository, 'Unexpected release base repository');
  assert.equal(pr.head.repo.full_name, repository, 'Do not write to a fork release branch');
  assert.equal(pr.base.ref, 'main', 'Release PR must target main');
  assert.equal(pr.head.ref, releaseBranch, 'Unexpected release PR branch');
  assert.ok(
    pr.labels.some(label => label.name === 'autorelease: pending'),
    'Missing pending-release label',
  );
  assert.match(pr.head.sha, /^[a-f0-9]{40}$/, 'Invalid release commit');
  return pr;
}

async function setDraft(api: GitHubRequest, pr: PullRequest, draft: boolean): Promise<void> {
  const mutation = draft ? 'convertPullRequestToDraft' : 'markPullRequestReadyForReview';
  await request(api, '/graphql', 'POST', {
    query: `mutation($id: ID!) { ${mutation}(input: {pullRequestId: $id}) { pullRequest { isDraft } } }`,
    variables: { id: pr.node_id },
  });
}

export async function draftExistingReleasePullRequest(api: GitHubRequest): Promise<void> {
  const prs = await request<{ number: number }[]>(
    api,
    `${root}/pulls?state=open&base=main&head=yunfeizhu%3A${releaseBranch}&per_page=100`,
  );
  assert.ok(prs.length <= 1, 'Expected at most one pending release PR');
  if (prs.length) {
    const pr = await getReleasePullRequest(api, prs[0].number);
    if (!pr.draft) {
      await setDraft(api, pr, true);
    }
  }
}

async function readAtCommit(api: GitHubRequest, filename: string, sha: string): Promise<string> {
  const file = await request<{ type: string; encoding: string; content: string }>(
    api,
    `${root}/contents/${filename}?ref=${sha}`,
  );
  assert.ok(
    file.type === 'file' && file.encoding === 'base64',
    `Cannot read release file ${filename}`,
  );
  return Buffer.from(file.content, 'base64').toString('utf8');
}

async function synchronizePullRequest(api: GitHubRequest, pr: PullRequest): Promise<string> {
  const filenames = [
    'package.json',
    'package-lock.json',
    '.release-please-manifest.json',
    'CHANGELOG.md',
    'CHANGELOG.zh.md',
    'README.md',
    'README-zh.md',
  ];
  const [packageText, lockText, manifestText, changelog, chineseChangelog, readme, chineseReadme] =
    await Promise.all(filenames.map(filename => readAtCommit(api, filename, pr.head.sha)));
  const manifest = JSON.parse(packageText) as { name: string; version: string; private?: boolean };
  const lockfile = JSON.parse(lockText);
  const documents: ReleaseDocuments = { changelog, chineseChangelog, readme, chineseReadme };
  const updated = await synchronizeReleaseDocuments(manifest.version, documents);
  verifyReleaseMetadata(
    `v${manifest.version}`,
    manifest,
    lockfile,
    updated.changelog,
    updated.chineseChangelog,
    {
      readme: updated.readme,
      chineseReadme: updated.chineseReadme,
      releaseManifest: JSON.parse(manifestText) as Record<string, string>,
    },
  );
  const paths: Record<keyof ReleaseDocuments, string> = {
    changelog: 'CHANGELOG.md',
    chineseChangelog: 'CHANGELOG.zh.md',
    readme: 'README.md',
    chineseReadme: 'README-zh.md',
  };
  const changes = (Object.keys(paths) as (keyof ReleaseDocuments)[]).filter(
    key => updated[key] !== documents[key],
  );
  if (!changes.length) {
    return pr.head.sha;
  }
  const current = await getReleasePullRequest(api, pr.number);
  assert.equal(current.head.sha, pr.head.sha, 'Release PR changed during documentation generation');
  const parent = await request<{ tree: { sha: string } }>(
    api,
    `${root}/git/commits/${pr.head.sha}`,
  );
  const tree = [];
  for (const key of changes) {
    const blob = await request<{ sha: string }>(api, `${root}/git/blobs`, 'POST', {
      content: updated[key],
      encoding: 'utf-8',
    });
    tree.push({ path: paths[key], mode: '100644', type: 'blob', sha: blob.sha });
  }
  const nextTree = await request<{ sha: string }>(api, `${root}/git/trees`, 'POST', {
    base_tree: parent.tree.sha,
    tree,
  });
  const commit = await request<{ sha: string }>(api, `${root}/git/commits`, 'POST', {
    message: 'chore(release): synchronize release documentation',
    tree: nextTree.sha,
    parents: [pr.head.sha],
  });
  // A non-fast-forward update fails if another run advanced the release branch. Never force-push.
  await request(api, `${root}/git/refs/heads/${releaseBranch}`, 'PATCH', {
    sha: commit.sha,
    force: false,
  });
  return commit.sha;
}

export async function completeReleasePullRequest(
  api: GitHubRequest,
  number: number,
  options: { sleep?: (milliseconds: number) => Promise<unknown>; attempts?: number } = {},
): Promise<void> {
  const pr = await getReleasePullRequest(api, number);
  if (!pr.draft) {
    await setDraft(api, pr, true);
  }
  const sha = await synchronizePullRequest(api, pr);
  const runsRoute = `${root}/actions/workflows/ci.yml/runs?event=workflow_dispatch&branch=${releaseBranch}&head_sha=${sha}&per_page=100`;
  const previous = await request<{ workflow_runs: WorkflowRun[] }>(api, runsRoute);
  const previousIds = new Set(previous.workflow_runs.map(run => run.id));
  // GITHUB_TOKEN pushes cannot be relied on to start CI. Dispatch the read-only CI workflow explicitly.
  await request(api, `${root}/actions/workflows/ci.yml/dispatches`, 'POST', { ref: releaseBranch });
  const sleep = options.sleep ?? delay;
  for (let attempt = 0; attempt < (options.attempts ?? 120); attempt++) {
    const { workflow_runs: runs } = await request<{ workflow_runs: WorkflowRun[] }>(api, runsRoute);
    const run = runs.find(
      candidate =>
        !previousIds.has(candidate.id) &&
        candidate.head_sha === sha &&
        candidate.head_branch === releaseBranch &&
        candidate.event === 'workflow_dispatch',
    );
    if (run?.status === 'completed') {
      assert.equal(run.conclusion, 'success', `Release CI did not pass: ${run.html_url}`);
      const current = await getReleasePullRequest(api, number);
      assert.equal(current.head.sha, sha, 'Release PR changed after CI; leave it in draft');
      await setDraft(api, current, false);
      console.log(`Release PR #${number} is ready; CI passed for ${sha}: ${run.html_url}`);
      return;
    }
    await sleep(10_000);
  }
  throw new Error(`Timed out waiting for release PR #${number} CI; leave it in draft`);
}

export async function dispatchNpmPublication(
  api: GitHubRequest,
  tag: string,
  sha: string,
): Promise<void> {
  assert.match(tag, /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Invalid npm release tag');
  assert.match(sha, /^[a-f0-9]{40}$/, 'Invalid npm release commit');
  let { object } = await request<{ object: { type: string; sha: string } }>(
    api,
    `${root}/git/ref/tags/${tag}`,
  );
  if (object.type === 'tag') {
    ({ object } = await request<{ object: { type: string; sha: string } }>(
      api,
      `${root}/git/tags/${object.sha}`,
    ));
  }
  assert.ok(
    object.type === 'commit' && object.sha === sha,
    'Release tag must point to the released commit',
  );
  // Bot-created tags do not trigger push workflows; the publish workflow still runs under the tag ref.
  await request(api, `${root}/actions/workflows/publish-npm.yml/dispatches`, 'POST', { ref: tag });
  console.log(`Started npm publishing for ${tag} (${sha})`);
}

export function createGitHubRequest(token: string): GitHubRequest {
  assert.ok(token, 'GH_TOKEN is required');
  return async (route, method = 'GET', body) => {
    assert.ok(route.startsWith(`${root}/`) || route === '/graphql', 'Unexpected GitHub API route');
    const response = await fetch(`https://api.github.com${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(
        `GitHub ${method} ${route} failed (${response.status}); check Actions permissions and logs`,
      );
    }
    return response.status === 204 ? undefined : response.json();
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(
    process.env.GITHUB_REPOSITORY,
    repository,
    'Run release automation only in the canonical repository',
  );
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Run release automation only from main');
  const api = createGitHubRequest(process.env.GH_TOKEN ?? '');
  if (process.argv[2] === '--draft') {
    await draftExistingReleasePullRequest(api);
  } else {
    if (process.env.RELEASE_CREATED === 'true') {
      await dispatchNpmPublication(
        api,
        process.env.RELEASE_TAG ?? '',
        process.env.RELEASE_SHA ?? '',
      );
    }
    const prs = JSON.parse(process.env.RELEASE_PRS || '[]') as { number: number }[];
    assert.ok(
      Array.isArray(prs) && prs.length <= 1,
      'Expected at most one root-package release PR',
    );
    for (const pr of prs) {
      await completeReleasePullRequest(api, pr.number);
    }
  }
}
