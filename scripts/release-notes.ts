import assert from 'node:assert/strict';
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

export async function synchronizeReleaseDocuments(
  version: string,
  documents: ReleaseDocuments,
): Promise<ReleaseDocuments> {
  assert.match(
    version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    'Invalid stable release version',
  );
  const heading = /^## \[(\d+\.\d+\.\d+)\](?:\([^\n]*\))?[^\n]*(\d{4}-\d{2}-\d{2})[^\n]*$/m.exec(
    documents.changelog,
  );
  assert.ok(
    heading && heading[1] === version,
    'English changelog must start with the release version and date',
  );
  assert.equal(
    documents.changelog.search(/^## /m),
    heading.index,
    'Unexpected changelog release heading',
  );
  const remaining = documents.changelog.slice(heading.index + heading[0].length);
  const nextHeading = remaining.search(/^## /m);
  const body = (nextHeading < 0 ? remaining : remaining.slice(0, nextHeading)).trim();
  assert.ok(body, 'Release notes must not be empty');
  const chineseBody = body.replace(
    /^### (.+)$/gm,
    (_line, title: string) => `### ${chineseHeadings[title] ?? title}`,
  );
  const updated: ReleaseDocuments = {
    changelog: documents.changelog,
    chineseChangelog: updateChineseChangelog(
      documents.chineseChangelog,
      version,
      `## [${version}] - ${heading[2]}\n\n${chineseBody}`,
    ),
    readme: replaceReadmeNotes(documents.readme, version, heading[2], body),
    chineseReadme: replaceReadmeNotes(documents.chineseReadme, version, heading[2], chineseBody),
  };
  // Release Please's generated Markdown must satisfy the same formatter as ordinary code PRs.
  const options = await resolveConfig(fileURLToPath(new URL('../README.md', import.meta.url)));
  for (const key of Object.keys(updated) as (keyof ReleaseDocuments)[]) {
    updated[key] = await format(updated[key], { ...options, parser: 'markdown' });
  }
  return updated;
}
