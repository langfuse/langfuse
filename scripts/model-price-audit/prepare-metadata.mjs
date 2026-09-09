#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  collectPricingModelChanges,
  collectTypeModelChanges,
  mergeModelChanges,
  normalizeReportedModel,
  validateChangedModelRow,
  validateOfficialSources,
} from "./audit-output-contract.mjs";

process.on("uncaughtException", (error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});

const requiredEnvironment = [
  "BASE_PRICING_FILE",
  "BASE_TYPES_FILE",
  "CURRENT_PRICING_FILE",
  "CURRENT_TYPES_FILE",
  "STRUCTURED_OUTPUT_PATH",
  "TYPES_DIFF_FILE",
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const output = JSON.parse(
  fs.readFileSync(process.env.STRUCTURED_OUTPUT_PATH, "utf8"),
);
const title = output.pullRequestTitle.trim();
const normalize = (value) => value.trim().toLowerCase();

if (!/^chore\(pricing\): [^\r\n]+$/.test(title) || title.length > 100) {
  throw new Error(
    "pullRequestTitle must be a single-line Conventional Commit title starting with 'chore(pricing): ' and no longer than 100 characters",
  );
}

const description = title.slice("chore(pricing): ".length).trim().toLowerCase();
if (
  /^(audit|refresh|update)( default)? (model )?(prices?|pricing)( data)?$/.test(
    description,
  )
) {
  throw new Error(
    "pullRequestTitle must identify the specific models or audit behavior changed",
  );
}

const basePricingText = fs.readFileSync(process.env.BASE_PRICING_FILE, "utf8");
const currentPricingText = fs.readFileSync(
  process.env.CURRENT_PRICING_FILE,
  "utf8",
);
const basePrices = JSON.parse(basePricingText);
const currentPrices = JSON.parse(currentPricingText);
const pricingModelChanges = collectPricingModelChanges(
  basePrices,
  currentPrices,
);
const removedPricingModels = pricingModelChanges.filter(
  (change) => change.expectedChange === "removed",
);
if (removedPricingModels.length > 0) {
  throw new Error(
    `Automated pricing-entry removal is not allowed: ${removedPricingModels
      .map((change) => change.modelName)
      .join(", ")}`,
  );
}

const typeModelChanges = collectTypeModelChanges(
  fs.readFileSync(process.env.BASE_TYPES_FILE, "utf8"),
  fs.readFileSync(process.env.CURRENT_TYPES_FILE, "utf8"),
  fs.readFileSync(process.env.TYPES_DIFF_FILE, "utf8"),
);

if (
  process.env.CHANGED_PRICING_JSON === "true" &&
  pricingModelChanges.length === 0
) {
  const digest = (value) =>
    createHash("sha256").update(value).digest("hex").slice(0, 12);
  throw new Error(
    "Pricing JSON changed without a concrete model-entry change " +
      `(base entries: ${basePrices.length}, current entries: ${currentPrices.length}, ` +
      `base sha256: ${digest(basePricingText)}, current sha256: ${digest(currentPricingText)})`,
  );
}
if (
  process.env.CHANGED_MODEL_TYPES === "true" &&
  typeModelChanges.length === 0
) {
  throw new Error(
    "Selectable-model types changed without a concrete model identifier change",
  );
}

const changedModelRows = output.modelsChecked.filter((item) =>
  ["added", "updated"].includes(item.change),
);
const changedRowsByModel = new Map(
  changedModelRows.map((item) => [normalizeReportedModel(item.model), item]),
);
for (const change of typeModelChanges) {
  const row = changedRowsByModel.get(normalize(change.modelName));
  if (row && normalize(row.provider) !== normalize(change.provider)) {
    throw new Error(
      `${change.arrayName} additions require provider ${change.provider}: ${change.modelName}`,
    );
  }
}
const expectedModelChanges = mergeModelChanges(
  pricingModelChanges,
  typeModelChanges,
);
for (const change of expectedModelChanges) {
  const row = changedRowsByModel.get(normalize(change.modelName));
  if (!row || row.change !== change.expectedChange) {
    throw new Error(
      `modelsChecked must report the actual ${change.expectedChange} model entry: ${change.modelName}`,
    );
  }
  validateOfficialSources(row.officialSources, row.model);
  validateChangedModelRow(row);
}

const affectedModels = new Map();
for (const change of expectedModelChanges) {
  affectedModels.set(normalize(change.modelName), change.modelName);
}
for (const row of changedModelRows) {
  if (!affectedModels.has(normalizeReportedModel(row.model))) {
    throw new Error(
      `modelsChecked reports a model without a matching pricing or selectable-model diff: ${row.model}`,
    );
  }
}

process.stdout.write(title);
