import type { OxlintConfig } from "oxlint";
declare const config: OxlintConfig & {
  overrides: NonNullable<OxlintConfig["overrides"]>;
};
export default config;
