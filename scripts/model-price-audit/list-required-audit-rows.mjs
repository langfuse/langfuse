#!/usr/bin/env node

// Lists every model ID whose pricing entry or selectable-model entry differs
// from HEAD, using the same rules as the audit output validator. Each listed
// ID needs exactly one changed `modelsChecked` row with that exact `model`.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import {
  collectPricingModelChanges,
  collectTypeModelChanges,
  mergeModelChanges,
} from "./audit-output-contract.mjs";

const pricingPath = "worker/src/constants/default-model-prices.json";
const typesPath = "packages/shared/src/server/llm/types.ts";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

const typeChanges = collectTypeModelChanges(
  git("show", `HEAD:${typesPath}`),
  fs.readFileSync(typesPath, "utf8"),
  git("diff", "--unified=0", "--", typesPath),
);
const changes = mergeModelChanges(
  collectPricingModelChanges(
    JSON.parse(git("show", `HEAD:${pricingPath}`)),
    JSON.parse(fs.readFileSync(pricingPath, "utf8")),
  ),
  typeChanges,
);

if (changes.length === 0) {
  console.log(
    "No model entries changed; no changed modelsChecked rows needed.",
  );
  process.exit(0);
}

const arraysByModel = new Map();
for (const change of typeChanges) {
  const arrays = arraysByModel.get(change.modelName) ?? [];
  arraysByModel.set(change.modelName, [...arrays, change]);
}

console.log(
  "Each line needs exactly one modelsChecked row with this exact model, change, and provider:",
);
for (const change of changes) {
  const arrays = arraysByModel.get(change.modelName) ?? [];
  const location =
    arrays.length > 0
      ? `${arrays.map((entry) => entry.arrayName).join(", ")}; provider ${arrays[0].provider}`
      : "default-model-prices.json";
  console.log(
    `- model=${change.modelName} change=${change.expectedChange} (${location})`,
  );
}
