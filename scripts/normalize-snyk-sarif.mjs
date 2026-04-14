#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const sarifPath = process.argv[2];

if (!sarifPath) {
  console.error("Usage: node scripts/normalize-snyk-sarif.mjs <sarif-file>");
  process.exit(1);
}

const normalizeSecuritySeverity = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= 10 ? String(value) : "0";
  }

  if (typeof value !== "string") {
    return "0";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "" || normalized === "undefined" || normalized === "null") {
    return "0";
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10 ? String(parsed) : "0";
};

const sarif = JSON.parse(await readFile(sarifPath, "utf8"));

let fixedRules = 0;

for (const [index, run] of (sarif.runs ?? []).entries()) {
  if (!run.automationDetails?.id) {
    run.automationDetails = {
      ...(run.automationDetails ?? {}),
      id: `snyk-container/${index}`,
    };
  }

  const rules = run.tool?.driver?.rules;
  if (!Array.isArray(rules)) {
    continue;
  }

  for (const rule of rules) {
    if (!rule.properties || !("security-severity" in rule.properties)) {
      continue;
    }

    const nextValue = normalizeSecuritySeverity(rule.properties["security-severity"]);
    if (rule.properties["security-severity"] !== nextValue) {
      rule.properties["security-severity"] = nextValue;
      fixedRules += 1;
    }
  }
}

await writeFile(sarifPath, `${JSON.stringify(sarif, null, 2)}\n`);

console.log(
  `Normalized ${fixedRules} invalid Snyk SARIF security-severity value(s) in ${sarifPath}`,
);
