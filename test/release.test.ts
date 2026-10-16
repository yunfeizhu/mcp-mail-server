import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  completeReleasePullRequest,
  createGitHubRequest,
  draftExistingReleasePullRequest,
  dispatchNpmPublication,
  type GitHubRequest,
} from '../scripts/complete-release';
import {
  chineseReleaseNotesPath,
  createChineseReleaseNotes,
  readChineseReleaseNotes,
  readmeStart,
  readmeEnd,
  synchronizeReleaseDocuments as synchronizeRaw,
  type ReleaseDocuments,
} from '../scripts/release-notes';
import { verifyReleaseMetadata } from '../scripts/verify-release';

const root = '/repos/yunfeizhu/mcp-mail-server';
const branch = 'release-please--branches--main--components--mcp-mail-server';
const initialSha = 'a'.repeat(40);
const synchronizedSha = 'b'.repeat(40);
const concurrentSha = 'c'.repeat(40);
const historicalNotes = '## [2.1.0] - 2026-09-27\n\n### 新增\n\n- 手写历史说明\n';
const chineseBody =
  '### 修复\n\n- **mail:** 修复回复主题前缀，并保留历史描述和链接。([#17](https://github.com/yunfeizhu/mcp-mail-server/pull/17))';

/** Give existing workflow fixtures explicitly reviewed translations rather than an English fallback. */
async function synchronizeReleaseDocuments(version: string, source: ReleaseDocuments) {
  return synchronizeRaw(
    version,
    source,
    createChineseReleaseNotes(version, source.changelog, chineseBody),
  );
}

test('release configuration refreshes draft PRs even when release notes have not changed', async () => {
  const configuration = JSON.parse(
    await readFile(new URL('../release-please-config.json', import.meta.url), 'utf8'),
  );
  // Otherwise Release Please emits no PR output after a failed run, and synchronization cannot retry.
  assert.equal(configuration['always-update'], true);
  assert.equal(configuration['draft-pull-request'], true);
  assert.equal(configuration['include-component-in-tag'], false);
  assert.equal(configuration['include-v-in-tag'], true);
  const workflow = await readFile(
    new URL('../.github/workflows/release-please.yml', import.meta.url),
    'utf8',
  );
  const draftStep = workflow.indexOf('run: npm run release:complete -- --draft');
  const releaseStep = workflow.indexOf('uses: googleapis/release-please-action@');
  assert.ok(
    draftStep >= 0 && releaseStep >= 0 && draftStep < releaseStep,
    'Existing release PRs must return to draft before Release Please modifies their branch',
  );
});

function englishNotes(version = '2.1.1'): string {
  return `# Changelog\n\n## [${version}](https://github.com/yunfeizhu/mcp-mail-server/compare/v2.1.0...v${version}) (2026-10-14)\n\n### Bug Fixes\n\n* **mail:** strip reply prefixes ([#17](https://github.com/yunfeizhu/mcp-mail-server/pull/17))\n\n## [2.1.0] - 2026-09-27\n\n### Added\n\n- Keep historical English notes\n`;
}

function readme(heading = 'Release notes'): string {
  return `# Mail server\n\nUsage stays untouched.\n\n## ${heading}\n\n${readmeStart}\n\n${readmeEnd}\n\n<details open>\n<summary><strong>v2.1.0</strong> — handwritten history</summary>\n\n- Historical summary\n\n</details>\n\n## Support\n\nFooter stays untouched.\n`;
}

function documents(): ReleaseDocuments {
  return {
    changelog: englishNotes(),
    chineseChangelog: '# 更新日志\n\n手写说明。\n\n' + historicalNotes,
    readme: readme(),
    chineseReadme: readme('版本说明'),
  };
}

test('release documentation synchronizes all summaries and preserves descriptions, links, and history', async () => {
  const updated = await synchronizeReleaseDocuments('2.1.1', documents());
  assert.match(updated.changelog, /## \[2\.1\.1\]/);
  assert.match(updated.changelog, /Keep historical English notes/);
  assert.match(updated.chineseChangelog, /## \[2\.1\.1\] - 2026-10-14/);
  assert.match(updated.chineseChangelog, /### 修复/);
  assert.ok(updated.chineseChangelog.endsWith(historicalNotes));
  assert.match(updated.readme, /strip reply prefixes/);
  assert.match(updated.chineseReadme, /修复回复主题前缀/);
  assert.doesNotMatch(updated.chineseReadme, /strip reply prefixes/);
  for (const summary of [updated.readme, updated.chineseReadme]) {
    assert.match(summary, /<summary><strong>v2\.1\.1<\/strong> — 2026-10-14/);
    assert.match(summary, /\[#17\]\(https:\/\/github.com\/yunfeizhu\/mcp-mail-server\/pull\/17\)/);
    assert.match(summary, /v2\.1\.0<\/strong> — handwritten history/);
    assert.match(summary, /^Usage stays untouched\./m);
    assert.match(summary, /^Footer stays untouched\./m);
    assert.equal(summary.match(/<details open>/g)?.length, 1);
  }
  assert.match(updated.readme, /### Bug Fixes/);
  assert.match(updated.chineseReadme, /### 修复/);
});

test('release synchronization is idempotent and replaces the same draft notes rather than duplicating them', async () => {
  const first = await synchronizeReleaseDocuments('2.1.1', documents());
  assert.deepEqual(await synchronizeReleaseDocuments('2.1.1', first), first);
  const changed = await synchronizeReleaseDocuments('2.1.1', {
    ...first,
    changelog: first.changelog.replace('strip reply prefixes', 'strip more reply prefixes'),
  });
  assert.equal(changed.chineseChangelog.match(/## \[2\.1\.1\]/g)?.length, 1);
  assert.match(changed.chineseChangelog, /修复回复主题前缀/);
  assert.doesNotMatch(changed.chineseChangelog, /strip more reply prefixes/);
  assert.ok(changed.chineseChangelog.endsWith(historicalNotes));
});

test('the next release archives previous generated changelog and README entries without losing handwritten history', async () => {
  const first = await synchronizeReleaseDocuments('2.1.1', documents());
  const next = await synchronizeReleaseDocuments('2.1.2', {
    ...first,
    changelog: englishNotes('2.1.2'),
  });
  assert.equal(next.chineseChangelog.match(/## \[2\.1\.1\]/g)?.length, 1);
  assert.equal(next.chineseChangelog.match(/## \[2\.1\.2\]/g)?.length, 1);
  assert.equal(next.chineseChangelog.match(/<!-- release-changelog:start -->/g)?.length, 1);
  assert.ok(next.chineseChangelog.endsWith(historicalNotes));
  for (const summary of [next.readme, next.chineseReadme]) {
    assert.equal(summary.match(/v2\.1\.1<\/strong>/g)?.length, 1);
    assert.equal(summary.match(/v2\.1\.2<\/strong>/g)?.length, 1);
    assert.equal(summary.match(/<details open>/g)?.length, 1);
    assert.match(summary, /handwritten history/);
  }
  assert.deepEqual(await synchronizeReleaseDocuments('2.1.2', next), next);
});

test('documentation synchronization rejects missing, duplicate, reordered, and unexpected managed markers', async () => {
  for (const invalidReadme of [
    readme().replace(readmeStart, ''),
    readme().replace(readmeEnd, ''),
    readme() + readmeStart + readmeEnd,
    `${readmeEnd}\n${readmeStart}`,
    readme().replace(
      `${readmeStart}\n`,
      `${readmeStart}\nHuman text must not be silently discarded.\n`,
    ),
  ]) {
    await assert.rejects(
      synchronizeReleaseDocuments('2.1.1', { ...documents(), readme: invalidReadme }),
      /markers/,
    );
  }
  await assert.rejects(
    synchronizeReleaseDocuments('2.1.1', {
      ...documents(),
      chineseChangelog: historicalNotes + '<!-- release-changelog:start -->',
    }),
    /markers/,
  );
});

test('documentation synchronization rejects unsafe versions, empty notes, and overwriting handwritten entries', async () => {
  await assert.rejects(synchronizeReleaseDocuments('2.1.1-beta.1', documents()), /stable/);
  await assert.rejects(synchronizeReleaseDocuments('2.1.2', documents()), /English changelog/);
  await assert.rejects(
    synchronizeReleaseDocuments('2.1.1', {
      ...documents(),
      changelog: '## [2.1.1] - 2026-10-14\n',
    }),
    /empty/,
  );
  await assert.rejects(
    synchronizeReleaseDocuments('2.1.1', {
      ...documents(),
      chineseChangelog: '## [2.1.1] - 2026-10-14\n\n手写说明。\n',
    }),
    /handwritten/,
  );
});

test('release verification enforces both README versions and the Release Please manifest', async () => {
  const updated = await synchronizeReleaseDocuments('2.1.1', documents());
  const manifest = { name: 'mcp-mail-server', version: '2.1.1' };
  const lockfile = { ...manifest, packages: { '': manifest } };
  const additional = {
    readme: updated.readme,
    chineseReadme: updated.chineseReadme,
    releaseManifest: { '.': '2.1.1' },
    chineseNotes: createChineseReleaseNotes('2.1.1', documents().changelog, chineseBody),
  };
  verifyReleaseMetadata(
    'v2.1.1',
    manifest,
    lockfile,
    updated.changelog,
    updated.chineseChangelog,
    additional,
  );
  for (const [key, expected] of [
    ['readme', 'README.md'],
    ['chineseReadme', 'README-zh.md'],
  ] as const) {
    assert.throws(
      () =>
        verifyReleaseMetadata(
          'v2.1.1',
          manifest,
          lockfile,
          updated.changelog,
          updated.chineseChangelog,
          { ...additional, [key]: readme(key === 'readme' ? 'Release notes' : '版本说明') },
        ),
      new RegExp(expected),
    );
  }
  assert.throws(
    () =>
      verifyReleaseMetadata(
        'v2.1.1',
        manifest,
        lockfile,
        updated.changelog,
        updated.chineseChangelog,
        { ...additional, releaseManifest: { '.': '2.1.0' } },
      ),
    /manifest version/,
  );
});

test('Chinese release sources preserve reviewed prose across refreshes and harmless English formatting', async () => {
  const input = documents();
  const reviewed = createChineseReleaseNotes('2.1.1', input.changelog, chineseBody);
  const first = await synchronizeRaw('2.1.1', input, reviewed);
  const refreshed = await synchronizeRaw('2.1.1', first, reviewed);
  assert.deepEqual(refreshed, first);
  const reformatted = {
    ...first,
    changelog: first.changelog.replace(/^- /gm, '* ').replace(/\n/g, '\r\n'),
  };
  const afterFormatting = await synchronizeRaw('2.1.1', reformatted, reviewed);
  assert.equal(afterFormatting.chineseChangelog, first.chineseChangelog);
  assert.equal(afterFormatting.chineseReadme, first.chineseReadme);
  assert.equal(readChineseReleaseNotes('2.1.1', input.changelog, reviewed), chineseBody);
  assert.match(first.chineseChangelog, /release-source-sha256:/);
  assert.doesNotMatch(first.chineseChangelog, /strip reply prefixes/);
});

for (const source of [undefined, '', ' \n ']) {
  test(
    'missing Chinese release prose cannot fall back to English: ' + JSON.stringify(source),
    async () => {
      await assert.rejects(
        synchronizeRaw('2.1.1', documents(), source),
        /Missing release-notes\/2\.1\.1\.zh\.md/,
      );
    },
  );
}

for (const body of [
  '### 修复\n\n- preserve mail identities and bound styled replies',
  '### 修复\n\n- 修复第一项。\n- untranslated second item',
  '### 修复\n\n- fix ' + String.fromCharCode(96) + '中文' + String.fromCharCode(96),
  '### 修复\n\n- fix https://example.com/中文',
  '### 修复\n\n- fix <!-- 中文注释不能当作译文 -->',
  '### 修复',
]) {
  test(
    'Chinese headings or non-prose text do not satisfy localization: ' + body.split('\n').at(-1),
    async () => {
      const input = documents();
      const source = createChineseReleaseNotes('2.1.1', input.changelog, body);
      await assert.rejects(synchronizeRaw('2.1.1', input, source), /Chinese|untranslated/);
    },
  );
}

test('Chinese source fingerprints reject changed descriptions, links, versions, and duplicate markers', async () => {
  const input = documents();
  const source = createChineseReleaseNotes('2.1.1', input.changelog, chineseBody);
  for (const changelog of [
    input.changelog.replace('strip reply prefixes', 'strip additional reply prefixes'),
    input.changelog.replace('/pull/17', '/pull/18'),
    input.changelog.replace('### Bug Fixes', '### Features'),
    input.changelog.replace('\n## [2.1.0]', '\n- another newly accumulated fix\n\n## [2.1.0]'),
  ]) {
    await assert.rejects(synchronizeRaw('2.1.1', { ...input, changelog }, source), /stale/);
  }
  for (const invalid of [
    chineseBody,
    source.replace(/sha256: [a-f0-9]+/, 'sha256: ' + '0'.repeat(64)),
    source + '\n' + source.split('\n')[0],
    createChineseReleaseNotes('2.1.2', englishNotes('2.1.2'), chineseBody),
  ]) {
    await assert.rejects(synchronizeRaw('2.1.1', input, invalid), /stale|source marker/);
  }
  const changedDate = input.changelog.replace('2026-10-14', '2026-10-16');
  const dated = await synchronizeRaw('2.1.1', { ...input, changelog: changedDate }, source);
  assert.match(dated.chineseChangelog, /2026-10-16/);
  assert.match(dated.chineseChangelog, /修复回复主题前缀/);
});

test('localized sources retain protocol names, code and links while archiving earlier Chinese releases', async () => {
  const input = documents();
  const body =
    '### 修复\n\n- 保留 ' +
    String.fromCharCode(96) +
    'Message-ID' +
    String.fromCharCode(96) +
    ' 大小写和 [相关说明](https://example.com/docs)。';
  const first = await synchronizeRaw(
    '2.1.1',
    input,
    createChineseReleaseNotes('2.1.1', input.changelog, body),
  );
  const nextInput = { ...first, changelog: englishNotes('2.1.2') };
  const second = await synchronizeRaw(
    '2.1.2',
    nextInput,
    createChineseReleaseNotes('2.1.2', nextInput.changelog, chineseBody),
  );
  for (const target of [second.chineseChangelog, second.chineseReadme]) {
    assert.match(target, /Message-ID/);
    assert.match(target, /https:\/\/example.com\/docs/);
    assert.match(target, /修复回复主题前缀/);
  }
});

test('the Chinese template CLI prints a current source marker without treating English as translated', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/prepare-chinese-release-notes.ts', manifest.version],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^<!-- release-source-sha256: [a-f0-9]{64} -->/);
  assert.match(result.stdout, /^### /m);
  assert.throws(
    () =>
      readChineseReleaseNotes(
        '2.1.1',
        englishNotes(),
        createChineseReleaseNotes('2.1.1', englishNotes()),
      ),
    /untranslated/,
  );
});

test('localization source paths reject unsafe and prerelease versions', () => {
  for (const version of ['../2.1.2', '2.1.2-beta.1', '02.1.2', '', '2.1.2/other']) {
    assert.throws(() => chineseReleaseNotesPath(version), /stable release version/);
  }
  assert.equal(chineseReleaseNotesPath('2.1.2'), 'release-notes/2.1.2.zh.md');
});

test('release verification rejects English residue, inconsistent prose, and stale or missing localized sources', async () => {
  const input = documents();
  const chineseNotes = createChineseReleaseNotes('2.1.1', input.changelog, chineseBody);
  const updated = await synchronizeRaw('2.1.1', input, chineseNotes);
  const manifest = { name: 'mcp-mail-server', version: '2.1.1' };
  const lock = { ...manifest, packages: { '': manifest } };
  const additional = {
    readme: updated.readme,
    chineseReadme: updated.chineseReadme,
    releaseManifest: { '.': '2.1.1' },
    chineseNotes,
  };
  const verify = (
    changelog = updated.chineseChangelog,
    options = additional,
    english = updated.changelog,
  ) => verifyReleaseMetadata('v2.1.1', manifest, lock, english, changelog, options);
  verify();
  const englishResidue = updated.chineseChangelog.replace(
    '修复回复主题前缀，并保留历史描述和链接。',
    'strip reply prefixes',
  );
  assert.throws(() => verify(englishResidue), /untranslated/);
  assert.throws(
    () =>
      verify(undefined, {
        ...additional,
        chineseReadme: additional.chineseReadme.replace('历史描述', '错误描述'),
      }),
    /descriptions must match/,
  );
  assert.throws(
    () => verify(undefined, { ...additional, chineseNotes: undefined }),
    /Missing release-notes/,
  );
  assert.throws(
    () =>
      verify(undefined, additional, updated.changelog.replace('strip reply prefixes', 'a new fix')),
    /stale/,
  );
  const bothEdited = {
    ...additional,
    chineseReadme: additional.chineseReadme.replace('历史描述', '未经审核的描述'),
  };
  assert.throws(
    () => verify(updated.chineseChangelog.replace('历史描述', '未经审核的描述'), bothEdited),
    /match the reviewed translation/,
  );
  for (const chineseReadme of [
    additional.chineseReadme.replace(/<!-- release-source-sha256:[^\n]+-->/, ''),
    additional.chineseReadme.replace(/sha256: [a-f0-9]+/, 'sha256: ' + '0'.repeat(64)),
  ]) {
    assert.throws(() => verify(undefined, { ...additional, chineseReadme }), /source markers/);
  }
});

for (const [version, requiresReviewedNotes] of [
  ['0.99.99', false],
  ['1.99.99', false],
  ['2.0.99', false],
  ['2.1.0', false],
  ['2.1.1', false],
  ['2.1.2', true],
  ['2.1.10', true],
  ['2.2.0', true],
  ['2.10.0', true],
  ['3.0.0', true],
  ['10.0.0', true],
] as const) {
  test(`release verification enforces the reviewed-source version boundary for ${version}`, () => {
    const manifest = { name: 'mcp-mail-server', version };
    const lockfile = { ...manifest, packages: { '': manifest } };
    const changelog = `## [${version}] - 2026-10-16\n\n### Bug Fixes\n\n- Fix reply prefixes.\n`;
    const chineseNotes = createChineseReleaseNotes(version, changelog, chineseBody);
    const verify = (body: string, source?: string) =>
      verifyReleaseMetadata(
        `v${version}`,
        manifest,
        lockfile,
        changelog,
        `<!-- release-changelog:start -->\n\n## [${version}] - 2026-10-16\n\n${body}\n\n<!-- release-changelog:end -->`,
        {
          readme: `## Release notes\n\n<summary><strong>v${version}</strong></summary>`,
          chineseReadme: `## 版本说明\n\n${readmeStart}\n\n<details open>\n<summary><strong>v${version}</strong> — 2026-10-16</summary>\n\n${body}\n\n</details>\n\n${readmeEnd}`,
          releaseManifest: { '.': version },
          chineseNotes: source,
        },
      );

    assert.doesNotThrow(() => verify(chineseNotes, chineseNotes));
    if (requiresReviewedNotes) {
      assert.throws(() => verify(chineseBody), /Missing release-notes/);
    } else {
      // Managed regions alone must not opt historical releases into the new requirement.
      assert.doesNotThrow(() => verify(chineseBody));
    }
    // Opted-in historical releases must still retain both the source and its markers.
    assert.throws(() => verify(chineseNotes), /Missing release-notes/);
    assert.throws(() => verify(chineseBody, chineseNotes), /source markers/);
  });
}

function releaseApi(
  options: {
    ci?: 'success' | 'failure' | 'missing' | 'wrong-sha';
    moveBeforeWrite?: boolean;
    moveAfterCI?: boolean;
    fork?: boolean;
    bot?: boolean;
    existingReady?: boolean;
    alreadySynchronized?: ReleaseDocuments;
    previousRun?: boolean;
    graphQLError?: boolean;
    chineseNotes?: string | null;
  } = {},
) {
  const source = options.alreadySynchronized ?? documents();
  const manifest = { name: 'mcp-mail-server', version: '2.1.1' };
  const files: Record<string, string> = {
    'package.json': JSON.stringify(manifest),
    'package-lock.json': JSON.stringify({ ...manifest, packages: { '': manifest } }),
    '.release-please-manifest.json': JSON.stringify({ '.': '2.1.1' }),
    'CHANGELOG.md': source.changelog,
    'CHANGELOG.zh.md': source.chineseChangelog,
    'README.md': source.readme,
    'README-zh.md': source.chineseReadme,
  };
  if (options.chineseNotes !== null) {
    files[chineseReleaseNotesPath('2.1.1')] =
      options.chineseNotes ?? createChineseReleaseNotes('2.1.1', source.changelog, chineseBody);
  }
  let sha = initialSha;
  let draft = !options.existingReady;
  let pullReads = 0;
  let dispatched = false;
  const calls: { route: string; method: string; body?: unknown }[] = [];
  const workflowRun = (id: number) => ({
    id,
    head_sha: sha,
    head_branch: branch,
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    html_url: `https://github.com/yunfeizhu/mcp-mail-server/actions/runs/${id}`,
  });
  const api: GitHubRequest = async (route, method = 'GET', body) => {
    calls.push({ route, method, body });
    if (route.startsWith(`${root}/pulls?`)) {
      return [{ number: 19 }];
    }
    if (route === `${root}/pulls/19`) {
      pullReads++;
      if (options.moveBeforeWrite && pullReads === 2) {
        sha = concurrentSha;
      }
      return {
        number: 19,
        node_id: 'PR_test',
        state: 'open',
        draft,
        user: { login: options.bot === false ? 'contributor' : 'github-actions[bot]' },
        labels: [{ name: 'autorelease: pending' }],
        base: { ref: 'main', repo: { full_name: 'yunfeizhu/mcp-mail-server' } },
        head: {
          sha,
          ref: branch,
          repo: {
            full_name: options.fork ? 'contributor/mcp-mail-server' : 'yunfeizhu/mcp-mail-server',
          },
        },
      };
    }
    if (route === '/graphql') {
      if (options.graphQLError) {
        return { errors: [{ message: 'Insufficient permissions' }] };
      }
      draft = (body as { query: string }).query.includes('convertPullRequestToDraft');
      return { data: {} };
    }
    if (route.startsWith(`${root}/contents/`)) {
      const [filename, ref] = route.slice(`${root}/contents/`.length).split('?ref=');
      assert.equal(ref, initialSha, 'Read files only from the immutable PR head');
      if (!(filename in files)) {
        throw new Error('GitHub GET failed (404)');
      }
      return {
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(files[filename]).toString('base64'),
      };
    }
    if (route === `${root}/git/commits/${initialSha}`) {
      return { tree: { sha: 'parent-tree' } };
    }
    if (route === `${root}/git/blobs`) {
      return { sha: 'blob-' + calls.length };
    }
    if (route === `${root}/git/trees`) {
      return { sha: 'new-tree' };
    }
    if (route === `${root}/git/commits`) {
      return { sha: synchronizedSha };
    }
    if (route === `${root}/git/refs/heads/${branch}`) {
      assert.deepEqual(body, { sha: synchronizedSha, force: false });
      sha = synchronizedSha;
      return {};
    }
    if (route === `${root}/actions/workflows/ci.yml/dispatches`) {
      assert.deepEqual(body, { ref: branch });
      dispatched = true;
      return undefined;
    }
    if (route.includes('/actions/workflows/ci.yml/runs?')) {
      const previous = options.previousRun ? [workflowRun(10)] : [];
      if (!dispatched || options.ci === 'missing') {
        return { workflow_runs: previous };
      }
      const run = workflowRun(11);
      if (options.ci === 'failure') {
        run.conclusion = 'failure';
      }
      if (options.ci === 'wrong-sha') {
        run.head_sha = concurrentSha;
      }
      if (options.moveAfterCI) {
        sha = concurrentSha;
      }
      return { workflow_runs: [run, ...previous] };
    }
    throw new Error(`Unexpected mock request: ${method} ${route}`);
  };
  return { api, calls, isDraft: () => draft };
}

const fastWait = { attempts: 2, sleep: async () => {} };

test('missing, stale, or untranslated sources keep release PRs in draft without documentation writes or CI dispatch', async () => {
  for (const chineseNotes of [
    null,
    createChineseReleaseNotes('2.1.1', englishNotes()),
    createChineseReleaseNotes(
      '2.1.1',
      englishNotes().replace('strip reply prefixes', 'new fix'),
      chineseBody,
    ),
  ]) {
    const fixture = releaseApi({ existingReady: true, chineseNotes });
    await assert.rejects(
      completeReleasePullRequest(fixture.api, 19, fastWait),
      /Cannot load|untranslated|stale/,
    );
    assert.equal(fixture.isDraft(), true);
    assert.ok(!fixture.calls.some(call => call.route.includes('/git/')));
    assert.ok(!fixture.calls.some(call => call.route.endsWith('/ci.yml/dispatches')));
    assert.ok(
      !fixture.calls.some(call =>
        (JSON.stringify(call.body) || '').includes('markPullRequestReadyForReview'),
      ),
    );
  }
});

test('preflight moves existing release PRs to draft before the release action touches their branch', async () => {
  const fixture = releaseApi({ existingReady: true });
  await draftExistingReleasePullRequest(fixture.api);
  assert.equal(fixture.isDraft(), true);
  assert.equal(fixture.calls.length, 3);
  assert.ok(fixture.calls.at(-1)?.route === '/graphql');
  await draftExistingReleasePullRequest(fixture.api);
  assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 1);
  const emptyCalls: string[] = [];
  await draftExistingReleasePullRequest(async route => {
    emptyCalls.push(route);
    return [];
  });
  assert.equal(emptyCalls.length, 1);
});

test('release PR documentation is committed atomically and made ready only after CI for its exact new commit', async () => {
  const fixture = releaseApi();
  await completeReleasePullRequest(fixture.api, 19, fastWait);
  assert.equal(fixture.isDraft(), false);
  const tree = fixture.calls.find(call => call.route === `${root}/git/trees`)?.body as {
    base_tree: string;
    tree: { path: string }[];
  };
  assert.equal(tree.base_tree, 'parent-tree');
  assert.deepEqual(
    tree.tree.map(entry => entry.path).sort(),
    ['CHANGELOG.md', 'CHANGELOG.zh.md', 'README-zh.md', 'README.md'].sort(),
  );
  const commit = fixture.calls.find(call => call.route === `${root}/git/commits`)?.body as {
    parents: string[];
  };
  assert.deepEqual(commit.parents, [initialSha]);
  assert.ok(fixture.calls.at(-1)?.route === '/graphql');
  assert.match(
    (fixture.calls.at(-1)?.body as { query: string }).query,
    /markPullRequestReadyForReview/,
  );
});

test('refreshing an already synchronized release PR skips document writes but dispatches fresh CI', async () => {
  const fixture = releaseApi({
    alreadySynchronized: await synchronizeReleaseDocuments('2.1.1', documents()),
    previousRun: true,
  });
  await completeReleasePullRequest(fixture.api, 19, fastWait);
  assert.ok(!fixture.calls.some(call => call.route.includes('/git/')));
  assert.ok(fixture.calls.some(call => call.route.endsWith('/ci.yml/dispatches')));
  assert.equal(fixture.isDraft(), false);
});

test('CI failure, missing runs, old runs, and a different commit never make a release PR ready', async () => {
  for (const ci of ['failure', 'missing', 'wrong-sha'] as const) {
    const fixture = releaseApi({ ci, previousRun: true });
    await assert.rejects(completeReleasePullRequest(fixture.api, 19, fastWait), /CI/);
    assert.equal(fixture.isDraft(), true);
    assert.ok(!fixture.calls.some(call => call.route === '/graphql'));
  }
});

test('an existing ready release PR returns to draft before synchronization and remains draft on failure', async () => {
  const fixture = releaseApi({ existingReady: true, ci: 'failure' });
  await assert.rejects(completeReleasePullRequest(fixture.api, 19, fastWait), /CI/);
  assert.equal(fixture.isDraft(), true);
  assert.equal(fixture.calls[1].route, '/graphql');
  assert.match((fixture.calls[1].body as { query: string }).query, /convertPullRequestToDraft/);
});

test('concurrent PR head changes block writes or readiness without force-pushing', async () => {
  for (const options of [{ moveBeforeWrite: true }, { moveAfterCI: true }]) {
    const fixture = releaseApi(options);
    await assert.rejects(completeReleasePullRequest(fixture.api, 19, fastWait), /changed/);
    assert.equal(fixture.isDraft(), true);
    assert.ok(!fixture.calls.some(call => call.route === '/graphql'));
  }
});

test('release synchronization refuses forks, non-bot PRs, and GraphQL permission errors', async () => {
  for (const options of [
    { fork: true },
    { bot: false },
    { existingReady: true, graphQLError: true },
  ]) {
    const fixture = releaseApi(options);
    await assert.rejects(completeReleasePullRequest(fixture.api, 19, fastWait));
    assert.ok(!fixture.calls.some(call => call.route.includes('/git/')));
  }
});

test('npm dispatch uses a verified version tag, including annotated tags, rather than a branch', async () => {
  for (const annotated of [false, true]) {
    const calls: { route: string; body?: unknown }[] = [];
    const api: GitHubRequest = async (route, _method, body) => {
      calls.push({ route, body });
      if (route.endsWith('/git/ref/tags/v2.1.1')) {
        return {
          object: {
            type: annotated ? 'tag' : 'commit',
            sha: annotated ? 'tag-object' : synchronizedSha,
          },
        };
      }
      if (route.endsWith('/git/tags/tag-object')) {
        return { object: { type: 'commit', sha: synchronizedSha } };
      }
      assert.ok(route.endsWith('/publish-npm.yml/dispatches'));
      return undefined;
    };
    await dispatchNpmPublication(api, 'v2.1.1', synchronizedSha);
    assert.deepEqual(calls.at(-1)?.body, { ref: 'v2.1.1' });
  }
});

test('npm dispatch rejects unsafe tags and mismatched tag commits before starting a workflow', async () => {
  const calls: string[] = [];
  const api: GitHubRequest = async route => {
    calls.push(route);
    return { object: { type: 'commit', sha: concurrentSha } };
  };
  for (const tag of ['main', 'v2.1.1-beta.1', 'v02.1.1']) {
    await assert.rejects(dispatchNpmPublication(api, tag, synchronizedSha), /tag/);
  }
  assert.equal(calls.length, 0);
  await assert.rejects(dispatchNpmPublication(api, 'v2.1.1', synchronizedSha), /released commit/);
  assert.equal(calls.length, 1);
});

test('release API client refuses missing credentials and unrelated repository routes', async () => {
  assert.throws(() => createGitHubRequest(''), /GH_TOKEN/);
  await assert.rejects(
    createGitHubRequest('test-only-token')('/repos/other/repository/pulls/1'),
    /Unexpected GitHub API route/,
  );
});
