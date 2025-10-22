const { resolve } = require("node:path");

const project = resolve(process.cwd(), "tsconfig.json");

// Handle eslint-config-turbo's default export
const turboConfig = require("eslint-config-turbo");
const turboConfigToUse = turboConfig.default || turboConfig;

/** @type {import("eslint").Linter.Config} */
module.exports = {
  // extends: ["eslint:recommended", "prettier"require().default],
  extends: ["eslint:recommended", "prettier"],
  plugins: ["only-warn", "turbo"],
  globals: {
    React: true,
    JSX: true,
  },
  env: {
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
  ignorePatterns: [
    // Ignore dotfiles
    ".*.js",
    "node_modules/",
    "dist/",
  ],
  rules: {
    "no-redeclare": "off",
    "import/order": "off",
    ...(turboConfigToUse.rules || {}),
  },
  overrides: [
    {
      files: ["*.js?(x)", "*.ts?(x)"],
    },
    {
      files: ["*.ts", "*.mts", "*.cts", "*.tsx"],
      // no-undef doesn't make sense in TS, see:
      // https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
      rules: {
        "no-undef": "off",
        "no-restricted-globals": [
          "error",
          {
            name: "redis",
            message:
              "Import redis explicitly from '@langfuse/shared/src/server' instead of using global.",
          },
        ],
      },
    },
    ...(turboConfigToUse.overrides || []),
  ],
};
