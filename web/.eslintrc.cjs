// eslint-disable-next-line @typescript-eslint/no-var-requires
const baseConfig = require('../.eslintrc.cjs');

// Check if baseConfig.extends is an array before spreading it
const extendsArray = Array.isArray(baseConfig.extends) ? baseConfig.extends : [];

/** @type {import("eslint").Linter.Config} */
const config = {
  ...baseConfig,
  extends: [...extendsArray, "next/core-web-vitals"],
  rules: {
    ...baseConfig.rules,
    "react/jsx-key": [
      "error",
      {
        warnOnDuplicates: true,
      },
    ],
  },
  plugins: ["@typescript-eslint"],
};

module.exports = config;
