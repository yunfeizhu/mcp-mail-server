import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const typescriptBin = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const tsxCli = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const buildSource = path.join(projectRoot, 'scripts', 'build.ts');
const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);

function run(args: string[], label: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal ? `${label} terminated by ${signal}` : `${label} failed with exit code ${code}`,
        ),
      );
    });
  });
}

await run(
  [typescriptBin, '--project', path.join(projectRoot, 'test', 'tsconfig.json')],
  'TypeScript test check',
);
await run([tsxCli, buildSource], 'Release bundle build');

const releaseEntry = await readFile(path.join(projectRoot, 'dist', 'index.js'), 'utf8');
const packageManifest = JSON.parse(
  await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
) as { dependencies?: Record<string, string> };
const runtimeDependencies = Object.keys(packageManifest.dependencies ?? {});
const runtimeImports = [
  ...releaseEntry.matchAll(/^import(?:[^'"]*from\s+)?['"]([^'"]+)['"];$/gm),
].map(match => match[1]);
const undeclaredImports = runtimeImports.filter(
  specifier =>
    !nodeBuiltins.has(specifier) &&
    !runtimeDependencies.some(
      dependency => specifier === dependency || specifier.startsWith(`${dependency}/`),
    ),
);
if (undeclaredImports.length) {
  throw new Error(
    `Release bundle contains undeclared external imports: ${undeclaredImports.join(', ')}`,
  );
}

await run(
  [
    tsxCli,
    '--test',
    path.join(projectRoot, 'test', 'core.test.ts'),
    path.join(projectRoot, 'test', 'server-smoke.test.ts'),
  ],
  'Test suite',
);
