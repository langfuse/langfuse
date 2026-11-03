import baseConfig from "@repo/oxlint-config";
import type { OxlintConfig } from "oxlint";

const config: OxlintConfig = {
  ...baseConfig,
  overrides: [
    ...baseConfig.overrides,
    {
      // Public index entrypoints declared in this package's exports map.
      files: [
        "src/index.ts",
        "src/server/index.ts",
        "src/server/clickhouse/index.ts",
        "src/server/instrumentation/bootstrap/index.ts",
        "src/utils/chatml/index.ts",
        "src/utils/normalized-io/index.ts",
        "src/encryption/index.ts",
        "src/server/ee/ingestionMasking/index.ts",
        "src/server/ee/fips/index.ts",
        "src/server/ee/licenseCheck/index.ts",
        "src/server/ee/clickhouseBilling/index.ts",
        "src/features/query/index.ts",
        "src/features/rbac/index.ts",
        "src/features/query/server/index.ts",
        "src/features/monitors/index.ts",
        "src/features/pagerduty/index.ts",
        "src/in-app-agent/index.ts",
        "src/topics/index.ts",
        "src/server/topics/index.ts",
      ],
      rules: { "@repo/no-internal-barrel-files": "off" },
    },
  ],
};

export default config;
