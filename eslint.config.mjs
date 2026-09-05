import nextTs from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';

const syntaxRules = [
  {
    selector: 'JSXOpeningElement[name.name="head"]',
    message:
      '禁止使用 head 标签，优先使用 metadata。三方 CSS、字体等资源可以在 globals.css 中顶部通过 @import 引入或者使用 next/font；preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入；json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld',
  },
];

const nextConfigRestrictedSyntaxRules = [
  {
    selector:
      'Property[key.name=/^(root|outputFileTracingRoot)$/] > Literal[value=/^\\//]',
    message:
      '禁止在 next.config 中写死绝对路径，请改用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。',
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'no-restricted-syntax': ['error', ...syntaxRules],
      // 存量 ~169 处 `any` 属历史债务，降级为 warn 保留可见性、不阻塞门禁；
      // 全量类型化在 tsc --noEmit 兜底下按需逐步收敛（见 docs/溯光_全面审查与优化方案.md E1）。
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // CommonJS 测试/脚本文件豁免 require 导入限制（属于该格式的合理用法）
  {
    files: ['**/*.cjs', 'scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // 以下文件 using require() 为刻意设计，豁免 no-require-imports：
  // - server.ts：独立 Node 服务器，require('crypto') 原生模块
  // - lib/ai/client.ts：惰性 require 避免运行时循环依赖（getDb/schema）
  // - lib/rich-text.ts：跨 Node/浏览器 的富文本工具，顶层 require katex/hljs 保证两端兼容
  {
    files: ['src/server.ts', 'src/lib/ai/client.ts', 'src/lib/rich-text.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['next.config.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...nextConfigRestrictedSyntaxRules],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Build artifacts:
    'server.js',
    'dist/**',
    // Script files (CommonJS):
    'scripts/**/*.js',
  ]),
]);

export default eslintConfig;
