import baseConfig from "@repo/oxlint-config";
import type { OxlintConfig } from "oxlint";

const config: OxlintConfig = {
  ...baseConfig,
  overrides: [
    ...baseConfig.overrides,
    {
      // Public index entrypoints declared in this package's exports map.
      files: ["src/index.ts", "src/sso/index.ts"],
      rules: { "@repo/no-internal-barrel-files": "off" },
    },
  ],
};

export default config;
