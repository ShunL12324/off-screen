// Flat eslint config. Two environments: Node (main + preload) and the
// browser-like renderer. The renderer scripts are loaded via classic
// <script> tags, not modules, so script sourceType is correct.
const globals = require("globals");

module.exports = [
  {
    files: ["main.js", "preload.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
    },
  },
  {
    files: ["renderer/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, LucideIcons: "readonly" },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
    },
  },
  {
    ignores: ["node_modules/", "dist/", "out/"],
  },
];
