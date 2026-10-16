import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChineseReleaseNotes } from './release-notes';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const [version, changelog = 'CHANGELOG.md', ...extra] = process.argv.slice(2);
assert.ok(
  version && extra.length === 0,
  'Usage: npm run --silent release:notes:zh -- X.Y.Z [path/to/English-CHANGELOG.md]',
);
// Print only; never overwrite an existing translation or silently bless stale prose.
process.stdout.write(
  createChineseReleaseNotes(version, await readFile(path.resolve(projectRoot, changelog), 'utf8')),
);
