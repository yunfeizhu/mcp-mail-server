import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { rollup } from 'rollup';
import { createRollupConfig } from '../rollup.config';
import {
  getBundleRun,
  measureBundle,
  publishBundleReport,
  renderBundleReport,
  validateBundleReport,
  type BundleGitHubRequest,
  type BundleReport,
} from '../scripts/bundle-size';

const root = '/repos/yunfeizhu/mcp-mail-server';
const headSha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const marker = '<!-- mcp-mail-server:bundle-size -->';

/** Provide isolated run/PR state and a recording API for comment-publication boundary tests. */
function fixture() {
  const report: BundleReport = {
    schemaVersion: 1,
    pullRequest: 7,
    headSha,
    baseSha,
    base: { raw: 1000, gzip: 100 },
    head: { raw: 1100, gzip: 90 },
  };
  const run = {
    id: 21,
    run_attempt: 1,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/bundle-analysis.yml',
    head_sha: headSha,
    repository: { full_name: 'yunfeizhu/mcp-mail-server' },
    pull_requests: [{ number: 7 }],
  };
  const pr = {
    number: 7,
    state: 'open',
    draft: false,
    head: { sha: headSha },
    base: { sha: baseSha, ref: 'main', repo: { full_name: 'yunfeizhu/mcp-mail-server' } },
  };
  const comments = new Map<number, unknown[]>();
  const writes: { route: string; method: string; body: unknown }[] = [];
  const reads: string[] = [];
  const api: BundleGitHubRequest = async (route, method = 'GET', body) => {
    if (method !== 'GET') {
      writes.push({ route, method, body });
      return {};
    }
    reads.push(route);
    if (route === `${root}/actions/runs/21`) {
      return run;
    }
    if (route === `${root}/pulls/7`) {
      return pr;
    }
    if (route === `${root}/commits/${headSha}/pulls?per_page=100`) {
      return [{ number: 7 }];
    }
    const match = route.match(/\/issues\/7\/comments\?per_page=100&page=(\d+)$/);
    if (match) {
      return comments.get(Number(match[1])) ?? [];
    }
    throw new Error(`Unexpected API route: ${route}`);
  };
  return { report, run, pr, comments, writes, reads, api };
}

test('bundle metrics count bytes, not characters, and use reproducible gzip level 9', () => {
  const bytes = Buffer.from('邮件服务器\n'.repeat(100));
  assert.deepEqual(measureBundle(bytes), {
    raw: bytes.byteLength,
    gzip: gzipSync(bytes, { level: 9 }).byteLength,
  });
  assert.notEqual(bytes.byteLength, bytes.toString().length);
  assert.deepEqual(measureBundle(new Uint8Array()), { raw: 0, gzip: 20 });
});

test('bundle reports describe increases, decreases, zero baselines, and the measurement boundary', () => {
  const { report } = fixture();
  let body = renderBundleReport(report, 21);
  assert.ok(body.startsWith(marker));
  assert.match(body, /\+100 B \(\+10\.00%\)/);
  assert.match(body, /-10 B \(-10\.00%\)/);
  assert.match(body, /external runtime dependencies/);
  assert.match(body, /not total install size/);
  assert.match(body, /actions\/runs\/21/);
  report.base.raw = 0;
  report.base.gzip = 0;
  body = renderBundleReport(report, 21);
  assert.match(body, /\+1,100 B \(n\/a\)/);
  assert.doesNotMatch(body, /NaN|Infinity/);
});

test('bundle report validation rejects invalid identities, versions, and size values', () => {
  const { report } = fixture();
  const invalid = [
    null,
    {},
    { ...report, schemaVersion: 2 },
    { ...report, pullRequest: '7' },
    { ...report, pullRequest: 0 },
    { ...report, pullRequest: 1.5 },
    { ...report, headSha: `${headSha}\n` },
    { ...report, baseSha: '[link](https://example.com)' },
    { ...report, head: undefined },
    ...[-1, 0.5, NaN, Infinity, '100', 512 * 1024 * 1024 + 1].map(raw => ({
      ...report,
      head: { raw, gzip: 90 },
    })),
  ];
  for (const value of invalid) {
    assert.throws(() => validateBundleReport(value));
  }
  assert.throws(() => renderBundleReport(report, NaN), /workflow run/);
});

test('only successful PR runs from the expected repository and workflow are accepted', async () => {
  const changes = [
    { id: 22 },
    { run_attempt: 0 },
    { event: 'push' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { path: '.github/workflows/other.yml' },
    { repository: { full_name: 'attacker/mcp-mail-server' } },
    { head_sha: 'not-a-sha' },
  ];
  for (const change of changes) {
    const f = fixture();
    Object.assign(f.run, change);
    await assert.rejects(getBundleRun(f.api, 21));
    assert.equal(f.writes.length, 0);
  }
});

test('the reporter creates one fixed-format comment after checking the current PR twice', async () => {
  const f = fixture();
  assert.equal(await publishBundleReport(f.api, 21, f.report), 'Created the bundle-size comment');
  assert.deepEqual(f.writes, [
    {
      route: `${root}/issues/7/comments`,
      method: 'POST',
      body: { body: renderBundleReport(f.report, 21) },
    },
  ]);
  assert.equal(f.reads.filter(route => route === `${root}/pulls/7`).length, 2);
});

test('the reporter paginates and updates only its own marked Actions comment', async () => {
  const f = fixture();
  f.comments.set(
    1,
    Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      body: marker,
      user: { login: 'someone-else', type: 'User' },
    })),
  );
  f.comments.set(2, [
    { id: 200, body: 'Not our report', user: { login: 'github-actions[bot]', type: 'Bot' } },
    { id: 201, body: marker, user: { login: 'another[bot]', type: 'Bot' } },
    { id: 202, body: `${marker}\nOld result`, user: { login: 'github-actions[bot]', type: 'Bot' } },
  ]);
  assert.equal(await publishBundleReport(f.api, 21, f.report), 'Updated the bundle-size comment');
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].route, `${root}/issues/comments/202`);
  assert.equal(f.writes[0].method, 'PATCH');
});

test('closed, draft, retargeted, and stale head/base reports never write comments', async () => {
  for (const kind of ['closed', 'draft', 'branch', 'head', 'base']) {
    const f = fixture();
    if (kind === 'closed') f.pr.state = 'closed';
    if (kind === 'draft') f.pr.draft = true;
    if (kind === 'branch') f.pr.base.ref = 'develop';
    if (kind === 'head') f.pr.head.sha = 'c'.repeat(40);
    if (kind === 'base') f.pr.base.sha = 'c'.repeat(40);
    assert.match(await publishBundleReport(f.api, 21, f.report), /^Skipped/);
    assert.equal(f.writes.length, 0);
  }
});

test('reports cannot select an unrelated PR, repository, or workflow commit', async () => {
  for (const kind of ['association', 'repository', 'commit']) {
    const f = fixture();
    if (kind === 'association') f.run.pull_requests = [{ number: 8 }];
    if (kind === 'repository') f.pr.base.repo.full_name = 'another/repo';
    if (kind === 'commit') f.report.headSha = 'c'.repeat(40);
    await assert.rejects(publishBundleReport(f.api, 21, f.report));
    assert.equal(f.writes.length, 0);
  }
});

test('fork PRs resolve the commit association when workflow_run omits its PR list', async () => {
  const f = fixture();
  f.run.pull_requests = [];
  await publishBundleReport(f.api, 21, f.report);
  assert.ok(f.reads.includes(`${root}/commits/${headSha}/pulls?per_page=100`));
  assert.equal(f.writes.length, 1);
});

test('a PR changing while comments are read is checked again and skipped', async () => {
  const f = fixture();
  const api: BundleGitHubRequest = async (route, method, body) => {
    const result = await f.api(route, method, body);
    if (route.includes('/comments?')) {
      f.pr.head.sha = 'c'.repeat(40);
    }
    return result;
  };
  assert.match(await publishBundleReport(api, 21, f.report), /^Skipped: PR changed/);
  assert.equal(f.writes.length, 0);
});

test('PR workflows stay unprivileged and the comment workflow runs only trusted code', async () => {
  for (const filename of ['preview-package.yml', 'bundle-analysis.yml']) {
    const workflow = await readFile(
      new URL(`../.github/workflows/${filename}`, import.meta.url),
      'utf8',
    );
    assert.match(workflow, /contents: read/);
    assert.match(workflow, /persist-credentials: false/);
    assert.doesNotMatch(
      workflow,
      /pull_request_target|secrets\.|(?:id-token|contents|pull-requests): write/,
    );
    for (const action of workflow.matchAll(/uses: (.+)/g)) {
      assert.match(action[1], /@[a-f0-9]{40}(?:\s|$)/);
    }
  }
  const reporter = await readFile(
    new URL('../.github/workflows/bundle-comment.yml', import.meta.url),
    'utf8',
  );
  assert.match(reporter, /workflow_run:/);
  assert.match(reporter, /ref: main/);
  assert.doesNotMatch(reporter, /ref: \$\{\{|npm (?:ci|install|exec|run)|pull_request_target/);
  assert.match(reporter, /bundle-size-report-\$\{run\.run_attempt\}/);
  assert.match(reporter, /artifact-ids: \$\{\{ steps\.artifact\.outputs\.id \}\}/);
});

test('optional offline Codecov analysis does not change the published CLI bundle or use the network', async t => {
  const network = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Builds must not upload Codecov data');
  });
  const generate = async (bundleAnalysis: boolean) => {
    const config = createRollupConfig({ minify: true, bundleAnalysis });
    const bundle = await rollup(config);
    try {
      return await bundle.generate(config.output);
    } finally {
      await bundle.close();
    }
  };
  const normal = await generate(false);
  const analysis = await generate(true);
  const normalEntry = normal.output.find(item => item.type === 'chunk');
  const analysisEntry = analysis.output.find(item => item.type === 'chunk');
  assert.ok(normalEntry && analysisEntry);
  assert.equal(normalEntry.code, analysisEntry.code);
  assert.equal(normal.output.length, 1, 'Normal builds must not emit analysis files');
  assert.ok(analysis.output.some(item => item.fileName.endsWith('-stats.json')));
  assert.equal(network.mock.callCount(), 0);
});
