#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const defaultFile = "worker/src/constants/default-model-prices.json";
const repoRoot = process.cwd();
const filePath = path.resolve(repoRoot, process.argv[2] ?? defaultFile);
const failures = [];

function compileMatchPattern(rawPattern, label) {
  let source = rawPattern;
  let flags = "";
  const inlineFlags = rawPattern.match(/^\(\?([dgimsuvy]*)\)/);

  if (inlineFlags) {
    flags = inlineFlags[1];
    source = rawPattern.slice(inlineFlags[0].length);
  }

  try {
    return new RegExp(source, flags);
  } catch (error) {
    failures.push(`${label}: invalid matchPattern (${error.message})`);
    return null;
  }
}

function keysOfPrices(prices) {
  return Object.keys(prices).sort();
}

const raw = await fs.readFile(filePath, "utf8");
const models = JSON.parse(raw);

if (!Array.isArray(models)) {
  throw new Error("Expected the pricing file to be a JSON array.");
}

const seenModelIds = new Set();
const seenModelNames = new Set();
const seenTierIds = new Set();

for (const model of models) {
  const label = model.modelName ?? model.id ?? "<unknown-model>";

  if (!model.id || typeof model.id !== "string") {
    failures.push(`${label}: missing string id`);
  } else {
    if (model.id.trim() !== model.id) {
      failures.push(
        `${label}: id must not contain leading/trailing whitespace`,
      );
    }

    if (seenModelIds.has(model.id)) {
      failures.push(`${label}: duplicate model id ${model.id}`);
    } else {
      seenModelIds.add(model.id);
    }
  }

  if (!model.modelName || typeof model.modelName !== "string") {
    failures.push(`${label}: missing string modelName`);
  } else {
    if (model.modelName.trim() !== model.modelName) {
      failures.push(
        `${label}: modelName must not contain leading/trailing whitespace`,
      );
    }

    if (seenModelNames.has(model.modelName)) {
      failures.push(`${label}: duplicate modelName ${model.modelName}`);
    } else {
      seenModelNames.add(model.modelName);
    }
  }

  if (!model.matchPattern || typeof model.matchPattern !== "string") {
    failures.push(`${label}: missing string matchPattern`);
  } else {
    if (model.matchPattern.trim() !== model.matchPattern) {
      failures.push(
        `${label}: matchPattern must not contain leading/trailing whitespace`,
      );
    }

    compileMatchPattern(model.matchPattern, label);
  }

  const createdAtMs = Date.parse(model.createdAt ?? "");
  const updatedAtMs = Date.parse(model.updatedAt ?? "");

  if (Number.isNaN(createdAtMs)) {
    failures.push(`${label}: invalid createdAt timestamp`);
  }

  if (Number.isNaN(updatedAtMs)) {
    failures.push(`${label}: invalid updatedAt timestamp`);
  }

  if (!Number.isNaN(createdAtMs) && !Number.isNaN(updatedAtMs)) {
    if (updatedAtMs < createdAtMs) {
      failures.push(`${label}: updatedAt must not be before createdAt`);
    }
  }

  if (!Array.isArray(model.pricingTiers) || model.pricingTiers.length === 0) {
    failures.push(`${label}: pricingTiers must be a non-empty array`);
    continue;
  }

  const defaultTiers = model.pricingTiers.filter((tier) => tier.isDefault);
  if (defaultTiers.length !== 1) {
    failures.push(`${label}: must have exactly one default tier`);
  }

  const seenPriorities = new Set();
  const seenNames = new Set();
  let expectedPriceKeys = null;

  for (const tier of model.pricingTiers) {
    const tierLabel = `${label}/${tier.name ?? tier.id ?? "<unknown-tier>"}`;

    if (!tier.id || typeof tier.id !== "string") {
      failures.push(`${tierLabel}: missing string id`);
    } else {
      if (tier.id.trim() !== tier.id) {
        failures.push(
          `${tierLabel}: tier id must not contain leading/trailing whitespace`,
        );
      }

      if (seenTierIds.has(tier.id)) {
        failures.push(`${tierLabel}: duplicate tier id ${tier.id}`);
      } else {
        seenTierIds.add(tier.id);
      }
    }

    if (!tier.name || typeof tier.name !== "string") {
      failures.push(`${tierLabel}: missing string name`);
    } else if (tier.name.trim() !== tier.name) {
      failures.push(
        `${tierLabel}: tier name must not contain leading/trailing whitespace`,
      );
    }

    if (seenPriorities.has(tier.priority)) {
      failures.push(`${tierLabel}: duplicate tier priority ${tier.priority}`);
    } else {
      seenPriorities.add(tier.priority);
    }

    if (seenNames.has(tier.name)) {
      failures.push(`${tierLabel}: duplicate tier name ${tier.name}`);
    } else {
      seenNames.add(tier.name);
    }

    if (!tier.prices || typeof tier.prices !== "object") {
      failures.push(`${tierLabel}: missing prices object`);
      continue;
    }

    const priceKeys = keysOfPrices(tier.prices);
    if (priceKeys.length === 0) {
      failures.push(`${tierLabel}: prices object must not be empty`);
    }

    for (const [usageType, price] of Object.entries(tier.prices)) {
      if (usageType.trim() !== usageType) {
        failures.push(
          `${tierLabel}: price key must not contain leading/trailing whitespace: ${usageType}`,
        );
      }

      if (typeof price !== "number" || Number.isNaN(price) || price < 0) {
        failures.push(`${tierLabel}: invalid price for ${usageType}`);
      }
    }

    if (tier.isDefault) {
      if (tier.priority !== 0) {
        failures.push(`${tierLabel}: default tier priority must be 0`);
      }

      if (!Array.isArray(tier.conditions) || tier.conditions.length !== 0) {
        failures.push(`${tierLabel}: default tier conditions must be []`);
      }
    } else {
      if (!(tier.priority > 0)) {
        failures.push(`${tierLabel}: non-default tier priority must be > 0`);
      }

      if (!Array.isArray(tier.conditions) || tier.conditions.length === 0) {
        failures.push(
          `${tierLabel}: non-default tiers must define at least one condition`,
        );
      }
    }

    if (!expectedPriceKeys) {
      expectedPriceKeys = priceKeys.join(",");
    } else if (expectedPriceKeys !== priceKeys.join(",")) {
      failures.push(
        `${tierLabel}: price keys must match the other tiers for ${label}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Pricing validation failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Validated ${models.length} pricing entries in ${path.relative(repoRoot, filePath)}.`,
);
