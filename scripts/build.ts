import { chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { rollup } from 'rollup';
import type { RollupBuild } from 'rollup';

import config from '../rollup.config';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const releaseEntry = path.join(projectRoot, 'dist', 'index.js');

process.chdir(projectRoot);

let bundle: RollupBuild | undefined;
try {
  await rm(path.join(projectRoot, 'dist'), { recursive: true, force: true });
  bundle = await rollup(config);
  const outputs = Array.isArray(config.output) ? config.output : [config.output];
  for (const output of outputs) await bundle.write(output);
  await chmod(releaseEntry, 0o755);
} finally {
  await bundle?.close();
}
