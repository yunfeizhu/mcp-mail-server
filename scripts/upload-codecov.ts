import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeOptions, Output, type Options } from '@codecov/bundler-plugin-core';

const repository = 'yunfeizhu/mcp-mail-server';
const bundleName = 'mcp-mail-server-esm';
const shaPattern = /^[a-f0-9]{40}$/;

interface GitHubEvent {
  repository: { full_name: string; private: boolean };
  number?: number;
  ref?: string;
  after?: string;
  deleted?: boolean;
  pull_request?: {
    number: number;
    draft: boolean;
    head: { ref: string; sha: string };
    base: { ref: string; sha: string; repo: { full_name: string } };
  };
}

type BundleStats = Pick<
  Output,
  'version' | 'builtAt' | 'duration' | 'bundler' | 'outputPath' | 'assets' | 'chunks' | 'modules'
> & { bundleName: string; plugin: { name: string; version: string } };

/**
 * Route public PRs to temporary tokenless identities and trusted main pushes to OIDC.
 * Reject local, private, or other event contexts before requesting an upload address.
 */
export function getCodecovUploadOptions(env: NodeJS.ProcessEnv, value: unknown): Options {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Codecov uploads run only in GitHub Actions');
  assert.equal(env.GITHUB_REPOSITORY, repository, 'Unexpected upload repository');
  assert.ok(value && typeof value === 'object', 'Missing GitHub event');
  const event = value as GitHubEvent;
  assert.equal(event.repository?.full_name, repository, 'Unexpected event repository');
  assert.equal(event.repository.private, false, 'Tokenless uploads require a public repository');

  const options: Options = {
    enableBundleAnalysis: true,
    bundleName,
    gitService: 'github',
    telemetry: false,
  };
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    const pr = event.pull_request;
    assert.ok(pr && !pr.draft, 'Expected a non-draft PR');
    assert.ok(Number.isSafeInteger(event.number) && event.number! > 0, 'Invalid PR number');
    assert.equal(pr.number, event.number, 'PR numbers do not match');
    assert.equal(pr.base.ref, 'main', 'Expected a PR targeting main');
    assert.equal(pr.base.repo.full_name, repository, 'Unexpected PR base repository');
    assert.match(pr.head.sha, shaPattern, 'Invalid PR head commit');
    assert.match(pr.base.sha, shaPattern, 'Invalid PR base commit');
    assert.ok(pr.head.ref && !/[:\r\n]/.test(pr.head.ref), 'Invalid PR head branch');
    options.uploadOverrides = {
      // This is only Codecov metadata, not a new Git branch or a security-setting change.
      branch: `pr${event.number}:${pr.head.ref}`,
      sha: pr.head.sha,
      compareSha: pr.base.sha,
      pr: String(event.number),
      slug: repository,
    };
    return options;
  }

  assert.equal(env.GITHUB_EVENT_NAME, 'push', 'Unsupported Codecov upload event');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'OIDC is restricted to main pushes');
  assert.equal(event.ref, env.GITHUB_REF, 'Push refs do not match');
  assert.notEqual(event.deleted, true, 'Cannot upload a deleted branch');
  assert.match(env.GITHUB_SHA ?? '', shaPattern, 'Invalid main commit');
  assert.equal(event.after, env.GITHUB_SHA, 'Push commits do not match');
  options.uploadOverrides = { branch: 'main', sha: env.GITHUB_SHA, slug: repository };
  options.oidc = { useGitHubOIDC: true };
  return options;
}

/**
 * Upload the official Rollup plugin's offline statistics without suppressing SDK errors.
 * A failed upload-address request or report PUT rejects, so CI cannot report false success.
 */
export async function uploadCodecovStats(value: unknown, options: Options): Promise<void> {
  assert.ok(value && typeof value === 'object', 'Missing Codecov statistics');
  const stats = value as BundleStats;
  assert.equal(stats.version, '3', 'Unsupported Codecov statistics version');
  assert.equal(stats.bundleName, bundleName, 'Unexpected Codecov bundle');
  assert.equal(stats.bundler?.name, 'rollup', 'Expected Rollup statistics');
  assert.equal(stats.plugin?.name, '@codecov/rollup-plugin', 'Unexpected analysis plugin');
  for (const items of [stats.assets, stats.chunks, stats.modules]) {
    assert.ok(Array.isArray(items) && items.length > 0, 'Empty Codecov statistics');
  }
  const normalized = normalizeOptions(options);
  assert.ok(normalized.success, 'Invalid Codecov upload options');
  assert.equal(normalized.options.bundleName, bundleName, 'Unexpected upload bundle');
  assert.equal(normalized.options.dryRun, false, 'Upload must not be a dry run');
  const output = new Output(normalized.options, { metaFramework: 'rollup' });
  Object.assign(output, {
    builtAt: stats.builtAt,
    duration: stats.duration,
    bundler: stats.bundler,
    outputPath: stats.outputPath,
    assets: stats.assets,
    chunks: stats.chunks,
    modules: stats.modules,
  });
  output.setPlugin(stats.plugin.name, stats.plugin.version);
  await output.write(true);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.env.GITHUB_EVENT_PATH, 'Missing GitHub event path');
  const event: unknown = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const options = getCodecovUploadOptions(process.env, event);
  const stats: unknown = JSON.parse(
    await readFile(new URL(`../dist/${bundleName}-stats.json`, import.meta.url), 'utf8'),
  );
  await uploadCodecovStats(stats, options);
  console.log('Codecov bundle statistics uploaded successfully.');
}
