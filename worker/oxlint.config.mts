import baseConfig from "@repo/oxlint-config";

export default {
  ...baseConfig,
  ignorePatterns: [...baseConfig.ignorePatterns, "**/*test*.*"],
};
