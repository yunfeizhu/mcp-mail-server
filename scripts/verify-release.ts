import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertChineseReleaseBody,
  chineseReleaseNotesPath,
  createChineseReleaseNotes,
  normalizeReleaseBody,
  readChineseReleaseNotes,
} from './release-notes';

interface PackageMetadata {
  name?: string;
  version?: string;
  private?: boolean;
}

interface LockfileMetadata extends PackageMetadata {
  packages?: Record<string, PackageMetadata>;
}

interface AdditionalReleaseMetadata {
  readme: string;
  chineseReadme: string;
  releaseManifest: Record<string, string>;
  chineseNotes?: string;
}

/** Verify version consistency, Chinese prose, and the provenance of newly generated localized notes. */
export function verifyReleaseMetadata(
  tag: string,
  manifest: PackageMetadata,
  lockfile: LockfileMetadata,
  changelog: string,
  chineseChangelog: string,
  additional: AdditionalReleaseMetadata,
): void {
  assert.match(tag, /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Use a stable vX.Y.Z tag');
  assert.equal(manifest.name, 'mcp-mail-server', 'Unexpected npm package name');
  assert.notEqual(manifest.private, true, 'A private package must not be published');
  assert.equal(tag, `v${manifest.version}`, 'Release tag must match package.json version');
  assert.equal(
    additional.releaseManifest['.'],
    manifest.version,
    'Release Please manifest version must match package.json',
  );
  assert.equal(lockfile.name, manifest.name, 'Lockfile package name must match package.json');
  assert.equal(lockfile.version, manifest.version, 'Lockfile version must match package.json');
  assert.equal(lockfile.packages?.['']?.name, manifest.name, 'Lockfile root package name mismatch');
  assert.equal(
    lockfile.packages?.['']?.version,
    manifest.version,
    'Lockfile root version must match package.json',
  );
  for (const [filename, contents] of [
    ['CHANGELOG.md', changelog],
    ['CHANGELOG.zh.md', chineseChangelog],
  ]) {
    const latestVersion = contents.match(/^##\s+\[(\d+\.\d+\.\d+)\]/m)?.[1];
    assert.equal(
      latestVersion,
      manifest.version,
      `${filename} must start with the release version`,
    );
  }
  for (const [filename, contents] of [
    ['README.md', additional.readme],
    ['README-zh.md', additional.chineseReadme],
  ]) {
    const notes = contents.match(/^## (?:Release notes|版本说明)\s*\n([\s\S]*)/m)?.[1];
    const latestVersion = notes?.match(/<summary><strong>v(\d+\.\d+\.\d+)<\/strong>/)?.[1];
    assert.equal(
      latestVersion,
      manifest.version,
      `${filename} must start with the release version`,
    );
  }
  const chineseHeading = /^##[ \t]+\[[^\]]+\][^\n]*(?:\n|$)/m.exec(chineseChangelog);
  assert.ok(chineseHeading, 'CHANGELOG.zh.md must contain a release heading');
  const remainder = chineseChangelog.slice(chineseHeading.index + chineseHeading[0].length);
  const nextHeading = remainder.search(/^## /m);
  const changelogBody = (nextHeading < 0 ? remainder : remainder.slice(0, nextHeading)).trim();
  const readmeBody = additional.chineseReadme.match(
    /<summary><strong>v\d+\.\d+\.\d+<\/strong>[^\n]*<\/summary>\s*([\s\S]*?)<\/details>/,
  )?.[1];
  assert.ok(readmeBody, 'README-zh.md must contain a complete current release summary');
  for (const [filename, body] of [
    ['CHANGELOG.zh.md', changelogBody],
    ['README-zh.md', readmeBody],
  ]) {
    assertChineseReleaseBody(body, filename);
  }
  assert.equal(
    normalizeReleaseBody(changelogBody),
    normalizeReleaseBody(readmeBody),
    'Chinese changelog and README release descriptions must match',
  );
  // Releases through 2.1.1 predate reviewed sources. From 2.1.2 onward,
  // require the source and its fingerprints even when all of them are missing.
  const [major, minor, patch] = manifest.version!.split('.').map(Number);
  const requiresReviewedNotes =
    major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 2)));
  if (
    requiresReviewedNotes ||
    additional.chineseNotes !== undefined ||
    [changelogBody, readmeBody].some(body => body.includes('<!-- release-source-sha256:'))
  ) {
    const reviewed = readChineseReleaseNotes(manifest.version!, changelog, additional.chineseNotes);
    const expectedMarker = createChineseReleaseNotes(manifest.version!, changelog, reviewed).split(
      '\n',
    )[0];
    for (const body of [changelogBody, readmeBody]) {
      assert.ok(
        body.split('<!-- release-source-sha256:').length === 2 && body.includes(expectedMarker),
        'Generated Chinese release source markers must match the reviewed translation',
      );
      assert.equal(
        normalizeReleaseBody(body),
        normalizeReleaseBody(reviewed),
        'Generated Chinese descriptions must match the reviewed translation',
      );
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const [
    manifestText,
    lockfileText,
    changelog,
    chineseChangelog,
    readme,
    chineseReadme,
    releaseManifestText,
  ] = await Promise.all(
    [
      'package.json',
      'package-lock.json',
      'CHANGELOG.md',
      'CHANGELOG.zh.md',
      'README.md',
      'README-zh.md',
      '.release-please-manifest.json',
    ].map(filename => readFile(path.join(projectRoot, filename), 'utf8')),
  );
  const manifest = JSON.parse(manifestText) as PackageMetadata;
  const lockfile = JSON.parse(lockfileText) as LockfileMetadata;
  let chineseNotes: string | undefined;
  try {
    chineseNotes = await readFile(
      path.join(projectRoot, chineseReleaseNotesPath(manifest.version!)),
      'utf8',
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  const tag = process.argv[2] || `v${manifest.version}`;
  verifyReleaseMetadata(tag, manifest, lockfile, changelog, chineseChangelog, {
    readme,
    chineseReadme,
    releaseManifest: JSON.parse(releaseManifestText) as Record<string, string>,
    chineseNotes,
  });
  console.log(`Release metadata verified for ${manifest.name}@${manifest.version} (${tag})`);
}
