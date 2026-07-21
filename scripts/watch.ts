import { fileURLToPath } from 'node:url';

import { watch } from 'rollup';

import { createRollupConfig } from '../rollup.config';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
process.chdir(projectRoot);

const config = createRollupConfig();
const watcher = watch(config);

watcher.on('event', event => {
  switch (event.code) {
    case 'BUNDLE_START':
      console.log(`[Rollup] Building ${event.input}...`);
      break;
    case 'BUNDLE_END':
      console.log(`[Rollup] Built ${event.output.join(', ')} in ${event.duration}ms`);
      void event.result.close();
      break;
    case 'ERROR':
      console.error('[Rollup] Build failed:', event.error);
      break;
  }
});

async function closeWatcher(signal: NodeJS.Signals): Promise<void> {
  console.log(`[Rollup] Stopping watch mode after ${signal}`);
  await watcher.close();
}

process.once('SIGINT', () => void closeWatcher('SIGINT'));
process.once('SIGTERM', () => void closeWatcher('SIGTERM'));
