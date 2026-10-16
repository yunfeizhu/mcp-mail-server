import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

export const readmeStart = '<!-- release-notes:start -->';
export const readmeEnd = '<!-- release-notes:end -->';
const changelogStart = '<!-- release-changelog:start -->';
const changelogEnd = '<!-- release-changelog:end -->';

export interface ReleaseDocuments {
  changelog: string;
  chineseChangelog: string;
  readme: string;
  chineseReadme: string;
}

/** Validate the version before using it in a repository-relative localization path. */
export function chineseReleaseNotesPath(version: string): string {
  assert.match(
    version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    'Invalid stable release version',
  );
  return `release-notes/${version}.zh.md`;
}

/** Normalize harmless Markdown bullet/line-ending differences without hiding changed descriptions or links. */
export function normalizeReleaseBody(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[*+](?= )/gm, '-')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/** Extract the newest English release and bind translations to its version and complete description. */
function englishRelease(version: string, changelog: string) {
  chineseReleaseNotesPath(version);
  const heading = /^## \[(\d+\.\d+\.\d+)\](?:\([^\n]*\))?[^\n]*(\d{4}-\d{2}-\d{2})[^\n]*$/m.exec(
    changelog,
  );
  assert.ok(
    heading && heading[1] === version,
    'English changelog must start with the release version and date',
  );
  assert.equal(changelog.search(/^## /m), heading.index, 'Unexpected changelog release heading');
  const remaining = changelog.slice(heading.index + heading[0].length);
  const nextHeading = remaining.search(/^## /m);
  const body = (nextHeading < 0 ? remaining : remaining.slice(0, nextHeading)).trim();
  assert.ok(body, 'Release notes must not be empty');
  const fingerprint = createHash('sha256')
    .update(version + '\n' + normalizeReleaseBody(body))
    .digest('hex');
  return { body, date: heading[2], fingerprint };
}

/** Require Chinese prose in every release-note item, not merely in headings, URLs, or code examples. */
export function assertChineseReleaseBody(body: string, context: string): void {
  const prose = body
    .replace(/^(\x60{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6}[ \t]+.*$/gm, '')
    .replace(/\x60[^\x60]*\x60/g, '')
    .replace(/https?:\/\/[^\s)]+/g, '');
  const items = prose.split(/(?=^[-*] )/m).filter(item => /^[-*] /.test(item));
  assert.ok(items.length > 0, `${context} must contain Chinese release-note items`);
  for (const item of items) {
    assert.match(
      item,
      /\p{Script=Han}/u,
      `${context} contains an untranslated release-note item; translate its prose, not just the heading`,
    );
  }
}

/** Create an editable template; its English items deliberately fail validation until translated. */
export function createChineseReleaseNotes(
  version: string,
  changelog: string,
  chineseBody?: string,
): string {
  const release = englishRelease(version, changelog);
  const body =
    chineseBody ??
    release.body.replace(
      /^### (.+)$/gm,
      (_line, title: string) => `### ${chineseHeadings[title] ?? title}`,
    );
  return `<!-- release-source-sha256: ${release.fingerprint} -->\n\n${body.trim()}\n`;
}

/** Read reviewed Chinese prose only when its source fingerprint covers the current English release. */
export function readChineseReleaseNotes(
  version: string,
  changelog: string,
  source: string | undefined,
): string {
  const release = englishRelease(version, changelog);
  const filename = chineseReleaseNotesPath(version);
  const expected = `<!-- release-source-sha256: ${release.fingerprint} -->`;
  assert.ok(
    typeof source === 'string' && source.trim(),
    `Missing ${filename}. Add reviewed Chinese notes on main. Expected first line: ${expected}`,
  );
  const normalized = source.replace(/\r\n?/g, '\n').trim();
  const markers = normalized.match(/<!-- release-source-sha256:[^\n]*-->/g) || [];
  assert.ok(
    markers.length === 1 && normalized.startsWith(expected + '\n'),
    `${filename} is stale or has an invalid source marker. Review the latest English notes before updating its first line to: ${expected}`,
  );
  const body = normalized.slice(expected.length).trim();
  assertChineseReleaseBody(body, filename);
  return body;
}

function managedRange(contents: string, start: string, end: string): [number, number] | undefined {
  const starts = contents.split(start).length - 1;
  const ends = contents.split(end).length - 1;
  assert.ok(starts <= 1 && ends <= 1 && starts === ends, 'Invalid or duplicate release markers');
  if (!starts) {
    return undefined;
  }
  const from = contents.indexOf(start);
  const to = contents.indexOf(end) + end.length;
  assert.ok(to > from + start.length, 'Release markers are out of order');
  return [from, to];
}

function replaceReadmeNotes(contents: string, version: string, date: string, body: string): string {
  const range = managedRange(contents, readmeStart, readmeEnd);
  assert.ok(range, 'README release markers are required');
  const previousNotes = contents
    .slice(range[0] + readmeStart.length, range[1] - readmeEnd.length)
    .trim();
  const previousVersion = previousNotes.match(/<summary><strong>v(\d+\.\d+\.\d+)<\/strong>/)?.[1];
  assert.ok(!previousNotes || previousVersion, 'Unexpected content inside README release markers');
  const block = `${readmeStart}\n\n<details open>\n<summary><strong>v${version}</strong> — ${date}</summary>\n\n${body}\n\n</details>\n\n${readmeEnd}`;
  const archive =
    previousVersion && previousVersion !== version
      ? '\n\n' + previousNotes.replace(/^<details open>$/m, '<details>')
      : '';
  const history = contents.slice(range[1]).replace(/^(\s*)<details open>/, '$1<details>');
  return contents.slice(0, range[0]) + block + archive + history;
}

function updateChineseChangelog(contents: string, version: string, entry: string): string {
  const range = managedRange(contents, changelogStart, changelogEnd);
  const block = `${changelogStart}\n\n${entry}\n\n${changelogEnd}`;
  if (range) {
    const previousEntry = contents
      .slice(range[0] + changelogStart.length, range[1] - changelogEnd.length)
      .trim();
    if (previousEntry.match(/^## \[(\d+\.\d+\.\d+)\]/)?.[1] === version) {
      return contents.slice(0, range[0]) + block + contents.slice(range[1]);
    }
    // Archive the previous generated entry, preserving its text and all older handwritten notes.
    return contents.slice(0, range[0]) + block + '\n\n' + previousEntry + contents.slice(range[1]);
  }
  const firstRelease = contents.search(/^## \[/m);
  assert.ok(firstRelease >= 0, 'Chinese changelog must contain existing release history');
  assert.notEqual(
    contents.slice(firstRelease).match(/^## \[([^\]]+)\]/)?.[1],
    version,
    'Do not overwrite handwritten release notes',
  );
  return contents.slice(0, firstRelease) + block + '\n\n' + contents.slice(firstRelease);
}

const chineseHeadings: Record<string, string> = {
  'Bug Fixes': '修复',
  Features: '新增',
  'Breaking Changes': '破坏性变更',
  'BREAKING CHANGES': '破坏性变更',
  'Performance Improvements': '性能优化',
  'Code Refactoring': '代码重构',
  Dependencies: '依赖更新',
  Documentation: '文档',
  Reverts: '回退',
  'Miscellaneous Chores': '维护',
};

/** Synchronize both languages from their own reviewed sources without overwriting Chinese prose with English. */
export async function synchronizeReleaseDocuments(
  version: string,
  documents: ReleaseDocuments,
  chineseNotes: string | undefined,
): Promise<ReleaseDocuments> {
  const { body, date } = englishRelease(version, documents.changelog);
  const reviewedBody = readChineseReleaseNotes(version, documents.changelog, chineseNotes);
  const chineseBody = createChineseReleaseNotes(version, documents.changelog, reviewedBody).trim();
  const updated: ReleaseDocuments = {
    changelog: documents.changelog,
    chineseChangelog: updateChineseChangelog(
      documents.chineseChangelog,
      version,
      `## [${version}] - ${date}\n\n${chineseBody}`,
    ),
    readme: replaceReadmeNotes(documents.readme, version, date, body),
    chineseReadme: replaceReadmeNotes(documents.chineseReadme, version, date, chineseBody),
  };
  // Release Please's generated Markdown must satisfy the same formatter as ordinary code PRs.
  const options = await resolveConfig(fileURLToPath(new URL('../README.md', import.meta.url)));
  for (const key of Object.keys(updated) as (keyof ReleaseDocuments)[]) {
    updated[key] = await format(updated[key], { ...options, parser: 'markdown' });
  }
  return updated;
}
