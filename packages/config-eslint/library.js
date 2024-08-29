const { resolve } = require("node:path");
const js = require("@eslint/js");
const prettier = require("eslint-config-prettier");
const turbo = require("eslint-config-turbo");
const onlyWarn = require("eslint-plugin-only-warn");
const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat();

const project = resolve(process.cwd(), "tsconfig.json");

module.exports = [
  js.configs.recommended,
  prettier,
  turbo.FlatCompat,
  {
    plugins: {
      "only-warn": onlyWarn,
    },
    languageOptions: {
      globals: {
        React: "writable",
        JSX: "writable",
      },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: true,
    },
    environment: {
      node: true,
      es6: true,
    },
    settings: {
      "import/resolver": {
        typescript: {
          project,
        },
      },
    },
    ignores: [".*.js", "node_modules/", "dist/"],
    rules: {
      "no-redeclare": "off",
      "import/order": "off",
    },
  },
  {
    files: ["*.js?(x)", "*.ts?(x)"],
  },
];
