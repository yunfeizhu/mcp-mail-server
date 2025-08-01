import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
// 移除未使用的 preserveShebang 插件导入

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
    // 压缩混淆
    terser({
      compress: {
        drop_console: false, // 保留 console.error 用于调试
        drop_debugger: true,
        pure_funcs: ['console.log'], // 移除 console.log
        passes: 2
      },
      mangle: {
        reserved: ['IMAPClient', 'SMTPClient', 'MailMCPServer'], // 保留主要类名
        properties: false
      },
      format: {
        comments: false
      }
    }),
    // 移除 shebang，MCP服务器不需要
  ]
};