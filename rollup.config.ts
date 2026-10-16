import { builtinModules } from 'node:module';

import { codecovRollupPlugin } from '@codecov/rollup-plugin';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import type { Plugin, RollupOptions } from 'rollup';
import ts from 'typescript';

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);
const RUNTIME_PACKAGES = ['@modelcontextprotocol/sdk', 'imap', 'mailparser', 'nodemailer', 'zod'];

/** Keep declared runtime packages external, including their subpath imports. */
function isRuntimePackage(id: string): boolean {
  return RUNTIME_PACKAGES.some(
    packageName => id === packageName || id.startsWith(`${packageName}/`),
  );
}

/** Transpile project sources without bundling TypeScript or changing runtime dependencies. */
function transpileTypeScript(): Plugin {
  return {
    name: 'transpile-typescript',
    transform(source, id) {
      const fileName = id.split('?', 1)[0];
      if (!fileName.endsWith('.ts') || fileName.endsWith('.d.ts')) return null;

      const result = ts.transpileModule(source, {
        fileName,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          sourceMap: false,
        },
        reportDiagnostics: true,
      });
      const errors = result.diagnostics?.filter(
        diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
      );
      if (errors?.length) {
        this.error(
          ts.formatDiagnosticsWithColorAndContext(errors, {
            getCanonicalFileName: name => name,
            getCurrentDirectory: () => process.cwd(),
            getNewLine: () => '\n',
          }),
        );
      }

      return { code: result.outputText, map: null };
    },
  };
}

interface BuildOptions {
  minify?: boolean;
  bundleAnalysis?: boolean;
}

/** Create the release build; optional Codecov analysis only emits offline statistics. */
export function createRollupConfig({ minify = false, bundleAnalysis = false }: BuildOptions = {}) {
  return {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'es',
      sourcemap: false,
      banner: '#!/usr/bin/env node',
    },
    external: id => NODE_BUILTINS.has(id) || isRuntimePackage(id),
    plugins: [
      resolve({
        extensions: ['.mjs', '.js', '.json', '.node', '.ts'],
        preferBuiltins: true,
      }),
      transpileTypeScript(),
      ...(minify ? [terser()] : []),
      ...(bundleAnalysis
        ? [
            codecovRollupPlugin({
              enableBundleAnalysis: true,
              bundleName: 'mcp-mail-server',
              gitService: 'github',
              telemetry: false,
              // Upload separately with strict error handling and event-scoped authentication.
              dryRun: true,
            }),
          ]
        : []),
    ],
  } satisfies RollupOptions;
}

const config = createRollupConfig({
  minify: true,
  bundleAnalysis: process.env.CODECOV_BUNDLE_ANALYSIS === 'true',
});

export default config;
