/** @type {import('stylelint').Config} */
export default {
  extends: 'stylelint-config-standard',
  rules: {
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['tailwind', 'apply', 'layer', 'theme', 'custom-variant'],
      },
    ],
    'hue-degree-notation': null,
    'import-notation': null,
    'lightness-notation': null,
    'rule-empty-line-before': null,
    'value-keyword-case': null,
    // ── 存量风格豁免（globals.css 既有紧凑书写/特定命名，非本次引入，改写有回归风险）──
    'declaration-block-single-line-max-declarations': null, // 单行多声明是该文件既有的紧凑风格
    'keyframes-name-pattern': null,                          // 既有驼峰 keyframe 名（fadeInUp 等被 JS 引用）
    'no-descending-specificity': null,                       // 层叠优先级重排可能改变样式，保持既有顺序
  },
};
