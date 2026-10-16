import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { type TestContext } from 'node:test';

import { getCodecovUploadOptions, uploadCodecovStats } from '../scripts/upload-codecov';

const repository = 'yunfeizhu/mcp-mail-server';
const sha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const publicRepository = { full_name: repository, private: false };

/** Describe a public same-repository PR without providing upload credentials or OIDC. */
function prFixture() {
  return {
    env: {
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: repository,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_SHA: 'c'.repeat(40), // The Actions merge SHA must not replace the PR head SHA.
    },
    event: {
      repository: { ...publicRepository },
      number: 21,
      pull_request: {
        number: 21,
        draft: false,
        head: { ref: 'codex/fix-upload', sha },
        base: { ref: 'main', sha: baseSha, repo: { full_name: repository } },
      },
    },
  };
}

/** Supply the identity fields of a trusted main push, separate from PR fixtures. */
function mainFixture() {
  return {
    env: {
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: repository,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: sha,
    },
    event: { repository: { ...publicRepository }, ref: 'refs/heads/main', after: sha },
  };
}

/** Create a minimal report matching the official Rollup plugin's version-3 wire format. */
function statsFixture() {
  return {
    version: '3',
    bundleName: 'mcp-mail-server-esm',
    builtAt: 1_700_000_000_000,
    duration: 100,
    outputPath: '',
    bundler: { name: 'rollup', version: '4.0.0' },
    plugin: { name: '@codecov/rollup-plugin', version: '2.0.1' },
    assets: [{ name: 'index.js', normalized: 'index.js', size: 100, gzipSize: 80 }],
    chunks: [
      {
        id: 'index',
        uniqueId: '0-index',
        entry: true,
        initial: false,
        names: ['index'],
        files: ['index.js'],
        dynamicImports: [],
      },
    ],
    modules: [{ name: './src/index.ts', size: 100, chunkUniqueIds: ['0-index'] }],
  };
}

/** Exercise the real SDK offline: intercept every fetch, including its GitHub job lookup. */
function mockUpload(t: TestContext, addressStatus: number, uploadStatus = 200) {
  const previous = process.env.GITHUB_ACTIONS;
  process.env.GITHUB_ACTIONS = 'true';
  t.after(() => {
    if (previous === undefined) {
      delete process.env.GITHUB_ACTIONS;
    } else {
      process.env.GITHUB_ACTIONS = previous;
    }
  });
  const requests: { url: string; init?: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.startsWith('https://api.github.com/') && url.endsWith('/jobs')) {
      return new Response(null, { status: 404 });
    }
    if (url === 'https://api.codecov.io/upload/bundle_analysis/v1') {
      return Response.json({ url: 'https://upload.example.test/stats' }, { status: addressStatus });
    }
    assert.equal(url, 'https://upload.example.test/stats', 'Unexpected network request');
    assert.equal(init?.method, 'PUT');
    return new Response(null, { status: uploadStatus });
  });
  return requests;
}

test('same-repository and fork PRs use temporary tokenless branch metadata and exact head SHA', () => {
  for (const branch of ['codex/fix-upload', 'contributor-fix', '修复上传']) {
    const { env, event } = prFixture();
    event.pull_request.head.ref = branch;
    const options = getCodecovUploadOptions(env, event);
    assert.deepEqual(options.uploadOverrides, {
      branch: `pr21:${branch}`,
      sha,
      compareSha: baseSha,
      pr: '21',
      slug: repository,
    });
    assert.equal(options.gitService, 'github');
    assert.equal(options.uploadToken, undefined);
    assert.equal(options.oidc, undefined);
    assert.equal(options.telemetry, false);
    assert.equal(event.pull_request.head.ref, branch, 'GitHub branch names must not be changed');
  }
});

test('only trusted main pushes select OIDC, without an upload token or temporary branch', () => {
  const { env, event } = mainFixture();
  const options = getCodecovUploadOptions(env, event);
  assert.deepEqual(options.oidc, { useGitHubOIDC: true });
  assert.deepEqual(options.uploadOverrides, { branch: 'main', sha, slug: repository });
  assert.equal(options.uploadToken, undefined);
});

test('local, other-repository, private, unsupported, and mismatched push contexts are rejected', () => {
  const mutations = [
    (f: ReturnType<typeof mainFixture>) => (f.env.GITHUB_ACTIONS = 'false'),
    (f: ReturnType<typeof mainFixture>) => (f.env.GITHUB_REPOSITORY = 'other/repo'),
    (f: ReturnType<typeof mainFixture>) => (f.event.repository.full_name = 'other/repo'),
    (f: ReturnType<typeof mainFixture>) => (f.event.repository.private = true),
    (f: ReturnType<typeof mainFixture>) => (f.env.GITHUB_EVENT_NAME = 'workflow_dispatch'),
    (f: ReturnType<typeof mainFixture>) => (f.env.GITHUB_EVENT_NAME = 'pull_request_target'),
    (f: ReturnType<typeof mainFixture>) => (f.env.GITHUB_REF = 'refs/heads/develop'),
    (f: ReturnType<typeof mainFixture>) => (f.event.ref = 'refs/heads/develop'),
    (f: ReturnType<typeof mainFixture>) => (f.event.after = baseSha),
    (f: ReturnType<typeof mainFixture>) => (f.env.GITHUB_SHA = 'invalid'),
  ];
  for (const mutate of mutations) {
    const f = mainFixture();
    mutate(f);
    assert.throws(() => getCodecovUploadOptions(f.env, f.event));
  }
  const f = mainFixture();
  assert.throws(() => getCodecovUploadOptions(f.env, { ...f.event, deleted: true }));
  assert.throws(() => getCodecovUploadOptions(f.env, null));
});

test('malformed, draft, and retargeted PR identities are rejected before upload', () => {
  const mutations = [
    (f: ReturnType<typeof prFixture>) => (f.event.number = 0),
    (f: ReturnType<typeof prFixture>) => (f.event.pull_request.number = 22),
    (f: ReturnType<typeof prFixture>) => (f.event.pull_request.draft = true),
    (f: ReturnType<typeof prFixture>) => (f.event.pull_request.base.ref = 'develop'),
    (f: ReturnType<typeof prFixture>) => (f.event.pull_request.base.repo.full_name = 'other/repo'),
    (f: ReturnType<typeof prFixture>) => (f.event.pull_request.base.sha = 'invalid'),
    (f: ReturnType<typeof prFixture>) => (f.event.pull_request.head.sha = 'invalid'),
    (f: ReturnType<typeof prFixture>) => (f.event.pull_request.head.ref = ''),
    (f: ReturnType<typeof prFixture>) => (f.event.pull_request.head.ref = 'main:other'),
    (f: ReturnType<typeof prFixture>) => (f.event.pull_request.head.ref = 'main\n'),
  ];
  for (const mutate of mutations) {
    const f = prFixture();
    mutate(f);
    assert.throws(() => getCodecovUploadOptions(f.env, f.event));
  }
});

test('Codecov HTTP 400 and 429 address failures reject instead of silently succeeding', async t => {
  const { env, event } = prFixture();
  const options = { ...getCodecovUploadOptions(env, event), retryCount: 1 };
  for (const status of [400, 429]) {
    await t.test(`HTTP ${status}`, async t => {
      const requests = mockUpload(t, status);
      await assert.rejects(uploadCodecovStats(statsFixture(), options));
      assert.equal(requests.filter(request => request.init?.method === 'PUT').length, 0);
    });
  }
});

test('a report PUT failure also rejects after successful upload-address authentication', async t => {
  const { env, event } = prFixture();
  const requests = mockUpload(t, 202, 500);
  await assert.rejects(
    uploadCodecovStats(statsFixture(), { ...getCodecovUploadOptions(env, event), retryCount: 1 }),
    /Failed to upload stats/,
  );
  assert.equal(requests.filter(request => request.init?.method === 'PUT').length, 1);
});

test('successful uploads preserve the official statistics and send no PR auth header', async t => {
  const { env, event } = prFixture();
  const requests = mockUpload(t, 202);
  const stats = statsFixture();
  await uploadCodecovStats(stats, getCodecovUploadOptions(env, event));
  const address = requests.find(request => request.init?.method === 'POST');
  assert.ok(address);
  assert.equal(new Headers(address.init?.headers).has('Authorization'), false);
  const metadata = JSON.parse(String(address.init?.body));
  assert.equal(metadata.branch, 'pr21:codex/fix-upload');
  assert.equal(metadata.commit, sha);
  assert.equal(metadata.pr, '21');
  assert.equal(metadata.git_service, 'github');
  const upload = requests.find(request => request.init?.method === 'PUT');
  assert.ok(upload);
  const reader = (upload.init?.body as ReadableStream<Uint8Array>).getReader();
  const bytes: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    bytes.push(value);
  }
  assert.deepEqual(JSON.parse(Buffer.concat(bytes).toString('utf8')), stats);
});

test('invalid, empty, or dry-run reports are rejected before any SDK network call', async t => {
  const { env, event } = prFixture();
  const options = getCodecovUploadOptions(env, event);
  const fetchMock = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Unexpected network request');
  });
  for (const value of [
    null,
    {},
    { ...statsFixture(), version: '4' },
    { ...statsFixture(), bundleName: 'other' },
    { ...statsFixture(), assets: [] },
    { ...statsFixture(), chunks: [] },
    { ...statsFixture(), modules: [] },
    { ...statsFixture(), plugin: { name: 'other' } },
    { ...statsFixture(), bundler: { name: 'other' } },
  ]) {
    await assert.rejects(uploadCodecovStats(value, options));
  }
  await assert.rejects(uploadCodecovStats(statsFixture(), { ...options, dryRun: true }));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('main OIDC is isolated from PR builds and both uploads are explicit, strict steps', async () => {
  const baseline = await readFile(
    new URL('../.github/workflows/bundle-baseline.yml', import.meta.url),
    'utf8',
  );
  assert.match(baseline, /push:\s+branches: \[main\]/);
  assert.doesNotMatch(baseline, /pull_request|workflow_dispatch|secrets\.|contents: write/);
  assert.match(baseline, /github\.event_name == 'push'/);
  assert.match(baseline, /github\.ref == 'refs\/heads\/main'/);
  assert.match(baseline, /id-token: write/);
  assert.match(baseline, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(baseline, /persist-credentials: false/);
  assert.match(baseline, /run: npm run bundle:upload/);
  for (const action of baseline.matchAll(/uses: (.+)/g)) {
    assert.match(action[1], /@[a-f0-9]{40}(?:\s|$)/);
  }
  const pr = await readFile(
    new URL('../.github/workflows/bundle-analysis.yml', import.meta.url),
    'utf8',
  );
  assert.match(pr, /pull_request:/);
  assert.doesNotMatch(pr, /\bpush:|id-token:|secrets\.|continue-on-error/);
  assert.match(pr, /run: npm run bundle:upload/);
});
