import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'es',
    sourcemap: false,
    banner: '#!/usr/bin/env node'
  },
  external: [
    // 外部依赖，不打包进bundle
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/sdk/server/index.js',
    '@modelcontextprotocol/sdk/server/stdio.js', 
    '@modelcontextprotocol/sdk/types.js',
    'nodemailer',
    'mailparser',
    'imap',
    'net',
    'tls',
    'events',
    'crypto',
    'fs',
    'path',
    'util',
    'stream',
    'buffer',
    'url'
  ],
  plugins: [
    // 解析 node_modules 中的模块
    resolve({
      preferBuiltins: true
    }),
    // 转换 CommonJS 为 ES6
    commonjs(),
    // TypeScript 编译
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: false,
      declaration: false
    }),
  ]
};
