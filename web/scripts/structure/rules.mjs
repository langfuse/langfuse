/** Stable public names; numeric IDs remain the baseline and CLI compatibility keys. */
/** @type {Record<number, string>} */
export const RULE_IDS = {
  1: "rule-1-component-file-names",
  2: "rule-2-component-exports",
  3: "rule-3-named-module-files",
  4: "rule-4-one-function-per-file",
  5: "rule-5-predictable-kind-folders",
  6: "rule-6-feature-local-ownership",
  7: "rule-7-no-component-internals",
  8: "rule-8-no-deep-feature-imports",
  9: "rule-9-explicit-public-surfaces",
  10: "rule-10-no-client-server-imports",
  11: "rule-11-no-runtime-import-cycles",
  12: "rule-12-thin-route-shims",
  13: "rule-13-frozen-legacy-ui",
  14: "rule-14-design-system-purity",
  15: "rule-15-preserve-move-history",
  16: "rule-16-file-level-lint-exceptions",
  17: "rule-17-no-new-structure-debt",
  18: "rule-18-colocated-unit-tests",
  19: "rule-19-test-import-boundaries",
  20: "rule-20-no-unused-exports",
};

/** @param {unknown} value @returns {number | null} */
export function parseRuleId(value) {
  if (/^\d+$/.test(String(value)) && RULE_IDS[Number(value)])
    return Number(value);
  const entry = Object.entries(RULE_IDS).find(([, slug]) => slug === value);
  return entry ? Number(entry[0]) : null;
}
