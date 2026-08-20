#!/usr/bin/env node

import fs from "node:fs";

process.on("uncaughtException", (error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});

const requiredEnvironment = [
  "BASE_PRICING_FILE",
  "CURRENT_PRICING_FILE",
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
const normalizeReportedModel = (value) =>
  normalize(value).replace(/\s+\((?:also\s+)?matches\b[^)]*\)$/u, "");

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

const basePrices = JSON.parse(
  fs.readFileSync(process.env.BASE_PRICING_FILE, "utf8"),
);
const currentPrices = JSON.parse(
  fs.readFileSync(process.env.CURRENT_PRICING_FILE, "utf8"),
);
const basePricesByName = new Map(
  basePrices.map((item) => [normalize(item.modelName), item]),
);
const currentPricesByName = new Map(
  currentPrices.map((item) => [normalize(item.modelName), item]),
);
const pricingModelChanges = [];
for (const modelName of new Set(
  Array.from(basePricesByName.keys()).concat(currentPricesByName.keys()),
)) {
  const before = basePricesByName.get(modelName);
  const after = currentPricesByName.get(modelName);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    pricingModelChanges.push({
      modelName: after?.modelName ?? before.modelName,
      expectedChange: before ? "updated" : "added",
    });
  }
}

const typeModelChanges = new Set();
for (const line of fs
  .readFileSync(process.env.TYPES_DIFF_FILE, "utf8")
  .split("\n")) {
  const match = line.match(/^[+-]\s*"([^"]+)"(?:,|:)/);
  if (match) typeModelChanges.add(match[1]);
}

if (
  process.env.CHANGED_PRICING_JSON === "true" &&
  pricingModelChanges.length === 0
) {
  throw new Error("Pricing JSON changed without a concrete model-entry change");
}
if (process.env.CHANGED_MODEL_TYPES === "true" && typeModelChanges.size === 0) {
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
for (const change of pricingModelChanges) {
  const row = changedRowsByModel.get(normalize(change.modelName));
  if (!row || row.change !== change.expectedChange) {
    throw new Error(
      `modelsChecked must report the actual ${change.expectedChange} pricing entry: ${change.modelName}`,
    );
  }
}

const affectedModels = new Map();
for (const change of pricingModelChanges) {
  affectedModels.set(normalize(change.modelName), change.modelName);
}
for (const modelName of typeModelChanges) {
  affectedModels.set(normalize(modelName), modelName);
  if (!changedRowsByModel.has(normalize(modelName))) {
    throw new Error(
      `modelsChecked must report the selectable-model change: ${modelName}`,
    );
  }
}
for (const row of changedModelRows) {
  if (!affectedModels.has(normalizeReportedModel(row.model))) {
    throw new Error(
      `modelsChecked reports a model without a matching pricing or selectable-model diff: ${row.model}`,
    );
  }
}

process.stdout.write(title);
