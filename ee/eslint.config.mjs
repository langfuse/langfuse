import baseConfig from "@repo/eslint-config";

export default [
  ...baseConfig,
  {
    name: "langfuse/ee/package-entrypoints",
    // Public index entrypoints declared in this package's exports map.
    files: ["src/index.ts", "src/sso/index.ts"],
    rules: { "@repo/no-internal-barrel-files": "off" },
  },
];
