const { pathToFileURL } = require("node:url");

/** @type {import("prettier").Config} */
const config = {
  // pathToFileURL: on Windows, Prettier's ESM plugin loader dynamic-imports
  // this path directly. A raw require.resolve() path (e.g. "D:\\...\\index.mjs")
  // is not a valid ESM specifier there and fails to load; a file:// URL is.
  plugins: [pathToFileURL(require.resolve("prettier-plugin-tailwindcss")).href],
};

module.exports = config;
