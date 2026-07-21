import { builtinModules } from 'node:module';

import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import type { Plugin, RollupOptions } from 'rollup';
import ts from 'typescript';

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);
const RUNTIME_PACKAGES = ['@modelcontextprotocol/sdk', 'imap', 'mailparser', 'nodemailer', 'zod'];

function isRuntimePackage(id: string): boolean {
  return RUNTIME_PACKAGES.some(
    packageName => id === packageName || id.startsWith(`${packageName}/`),
  );
}

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
}

export function createRollupConfig({ minify = false }: BuildOptions = {}) {
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
    ],
  } satisfies RollupOptions;
}

const config = createRollupConfig({ minify: true });

export default config;
