import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
}

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
  const tag = process.argv[2] || `v${manifest.version}`;
  verifyReleaseMetadata(tag, manifest, lockfile, changelog, chineseChangelog, {
    readme,
    chineseReadme,
    releaseManifest: JSON.parse(releaseManifestText) as Record<string, string>,
  });
  console.log(`Release metadata verified for ${manifest.name}@${manifest.version} (${tag})`);
}
