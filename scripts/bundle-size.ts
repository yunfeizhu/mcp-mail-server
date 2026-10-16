import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const repository = 'yunfeizhu/mcp-mail-server';
const root = `/repos/${repository}`;
const marker = '<!-- mcp-mail-server:bundle-size -->';
const shaPattern = /^[a-f0-9]{40}$/;

interface Size {
  raw: number;
  gzip: number;
}

export interface BundleReport {
  schemaVersion: 1;
  pullRequest: number;
  headSha: string;
  baseSha: string;
  base: Size;
  head: Size;
}

export type BundleGitHubRequest = (
  route: string,
  method?: 'GET' | 'POST' | 'PATCH',
  body?: unknown,
) => Promise<unknown>;

interface BundleRun {
  id: number;
  run_attempt: number;
  event: string;
  status: string;
  conclusion: string;
  path: string;
  head_sha: string;
  repository: { full_name: string };
  pull_requests: { number: number }[];
}

interface PullRequest {
  number: number;
  state: string;
  draft: boolean;
  head: { sha: string };
  base: { sha: string; ref: string; repo: { full_name: string } };
}

export function measureBundle(bytes: Uint8Array): Size {
  return { raw: bytes.byteLength, gzip: gzipSync(bytes, { level: 9 }).byteLength };
}

export function validateBundleReport(value: unknown): BundleReport {
  assert.ok(value && typeof value === 'object', 'Invalid bundle report');
  const report = value as BundleReport;
  assert.equal(report.schemaVersion, 1, 'Unsupported bundle report version');
  assert.ok(Number.isSafeInteger(report.pullRequest) && report.pullRequest > 0, 'Invalid PR');
  for (const sha of [report.headSha, report.baseSha]) {
    assert.ok(typeof sha === 'string' && shaPattern.test(sha), 'Invalid bundle commit');
  }
  for (const size of [report.base, report.head]) {
    assert.ok(size && typeof size === 'object', 'Missing bundle sizes');
    for (const bytes of [size.raw, size.gzip]) {
      assert.ok(
        Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= 512 * 1024 * 1024,
        'Invalid bundle size',
      );
    }
  }
  return report;
}

function change(before: number, after: number): string {
  const difference = after - before;
  const bytes = `${difference > 0 ? '+' : ''}${difference.toLocaleString('en-US')} B`;
  if (before === 0) {
    return `${bytes} (n/a)`;
  }
  const percent = (difference / before) * 100;
  return `${bytes} (${percent > 0 ? '+' : ''}${percent.toFixed(2)}%)`;
}

export function renderBundleReport(value: unknown, runId: number): string {
  const report = validateBundleReport(value);
  assert.ok(Number.isSafeInteger(runId) && runId > 0, 'Invalid workflow run');
  const rows = (['raw', 'gzip'] as const).map(
    metric =>
      `| dist/index.js${metric === 'gzip' ? ' (gzip)' : ''} | ${report.base[metric].toLocaleString('en-US')} B | ${report.head[metric].toLocaleString('en-US')} B | ${change(report.base[metric], report.head[metric])} |`,
  );
  return [
    marker,
    '## Bundle size',
    '',
    `Base [${report.baseSha.slice(0, 7)}](https://github.com/${repository}/commit/${report.baseSha}) → head [${report.headSha.slice(0, 7)}](https://github.com/${repository}/commit/${report.headSha}).`,
    '',
    '| Release artifact | Before | After | Change |',
    '| --- | ---: | ---: | ---: |',
    ...rows,
    '',
    'Measured from both minified release builds on Node.js 24, using each commit’s own lockfile. Gzip uses level 9.',
    '',
    'Only the CLI entry is measured: external runtime dependencies and README/changelog files are excluded. This is not total install size or a runtime-performance measurement. Informational only; CI remains the quality gate.',
    '',
    `[Workflow run](https://github.com/${repository}/actions/runs/${runId})`,
  ].join('\n');
}

export async function getBundleRun(api: BundleGitHubRequest, runId: number): Promise<BundleRun> {
  assert.ok(Number.isSafeInteger(runId) && runId > 0, 'Invalid workflow run');
  const run = (await api(`${root}/actions/runs/${runId}`)) as BundleRun;
  assert.equal(run.id, runId, 'Unexpected workflow run');
  assert.ok(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, 'Invalid run attempt');
  assert.equal(run.repository.full_name, repository, 'Unexpected workflow repository');
  assert.equal(run.path, '.github/workflows/bundle-analysis.yml', 'Unexpected workflow path');
  assert.equal(run.event, 'pull_request', 'Expected a PR workflow');
  assert.equal(run.status, 'completed', 'Workflow is not complete');
  assert.equal(run.conclusion, 'success', 'Bundle workflow did not succeed');
  assert.match(run.head_sha, shaPattern, 'Invalid workflow commit');
  return run;
}

export async function publishBundleReport(
  api: BundleGitHubRequest,
  runId: number,
  value: unknown,
): Promise<string> {
  const report = validateBundleReport(value);
  const run = await getBundleRun(api, runId);
  assert.equal(report.headSha, run.head_sha, 'Report does not match workflow commit');
  // GitHub may omit pull_requests from workflow_run for fork PRs. Resolve that association via API.
  const associated = run.pull_requests.length
    ? run.pull_requests
    : ((await api(`${root}/commits/${run.head_sha}/pulls?per_page=100`)) as { number: number }[]);
  assert.ok(
    associated.some(pr => pr.number === report.pullRequest),
    'Report PR is not associated with this workflow commit',
  );

  const getCurrentPullRequest = async (): Promise<PullRequest | undefined> => {
    const pr = (await api(`${root}/pulls/${report.pullRequest}`)) as PullRequest;
    assert.equal(pr.number, report.pullRequest, 'Unexpected PR');
    assert.equal(pr.base.repo.full_name, repository, 'Unexpected PR repository');
    if (
      pr.state !== 'open' ||
      pr.draft ||
      pr.base.ref !== 'main' ||
      pr.head.sha !== report.headSha ||
      pr.base.sha !== report.baseSha
    ) {
      return undefined;
    }
    return pr;
  };
  if (!(await getCurrentPullRequest())) {
    return 'Skipped a closed, draft, or outdated PR report';
  }

  let commentId: number | undefined;
  for (let page = 1; page <= 10; page++) {
    const comments = (await api(
      `${root}/issues/${report.pullRequest}/comments?per_page=100&page=${page}`,
    )) as { id: number; body: string; user: { login: string; type: string } }[];
    const own = comments.find(
      comment =>
        comment.user.login === 'github-actions[bot]' &&
        comment.user.type === 'Bot' &&
        comment.body?.startsWith(marker),
    );
    if (own) {
      assert.ok(Number.isSafeInteger(own.id) && own.id > 0, 'Invalid comment ID');
      commentId = own.id;
      break;
    }
    if (comments.length < 100) {
      break;
    }
    assert.ok(page < 10, 'Too many PR comments to safely locate the existing report');
  }
  if (!(await getCurrentPullRequest())) {
    return 'Skipped: PR changed while locating its comment';
  }
  const body = renderBundleReport(report, runId);
  await api(
    commentId
      ? `${root}/issues/comments/${commentId}`
      : `${root}/issues/${report.pullRequest}/comments`,
    commentId ? 'PATCH' : 'POST',
    { body },
  );
  return commentId ? 'Updated the bundle-size comment' : 'Created the bundle-size comment';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [baseFilename, headFilename, outputFilename] = process.argv.slice(2);
  assert.ok(
    baseFilename && headFilename && outputFilename,
    'Expected base, head, and output paths',
  );
  const report = validateBundleReport({
    schemaVersion: 1,
    pullRequest: Number(process.env.BUNDLE_PR_NUMBER),
    headSha: process.env.BUNDLE_HEAD_SHA,
    baseSha: process.env.BUNDLE_BASE_SHA,
    base: measureBundle(await readFile(baseFilename)),
    head: measureBundle(await readFile(headFilename)),
  });
  await mkdir(path.dirname(outputFilename), { recursive: true });
  await writeFile(outputFilename, `${JSON.stringify(report)}\n`, 'utf8');
  console.log(renderBundleReport(report, Number(process.env.GITHUB_RUN_ID ?? 1)));
}
