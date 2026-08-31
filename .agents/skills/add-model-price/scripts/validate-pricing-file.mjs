#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const defaultFile = "worker/src/constants/default-model-prices.json";
const repoRoot = process.cwd();
const args = process.argv.slice(2);
let pricingFile = defaultFile;
let baseFile = null;
const requestedUsageKeyModels = new Set();

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--base") {
    if (!args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error("--base requires a file path");
    }
    baseFile = args[index + 1];
    index += 1;
  } else if (argument === "--usage-key-model") {
    if (!args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error("--usage-key-model requires a model name");
    }
    requestedUsageKeyModels.add(args[index + 1]);
    index += 1;
  } else if (argument.startsWith("--")) {
    throw new Error(`Unknown argument: ${argument}`);
  } else {
    pricingFile = argument;
  }
}

const filePath = path.resolve(repoRoot, pricingFile);
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

function requireAliasFamily(model, tier, familyName, keys, required) {
  const presentKeys = keys.filter((key) => key in tier.prices);
  if (!required && presentKeys.length === 0) return;

  const tierLabel = `${model.modelName}/${tier.name}`;
  const missingKeys = keys.filter((key) => !(key in tier.prices));
  if (missingKeys.length > 0) {
    failures.push(
      `${tierLabel}: incomplete ${familyName} usage-key family; missing ${missingKeys.join(", ")}`,
    );
    return;
  }

  const expectedPrice = tier.prices[keys[0]];
  const mismatchedKeys = keys.filter(
    (key) => tier.prices[key] !== expectedPrice,
  );
  if (mismatchedKeys.length > 0) {
    failures.push(
      `${tierLabel}: ${familyName} aliases must have the same price (${keys.join(", ")})`,
    );
  }
}

function validateUsageKeyCoverage(model) {
  if (
    typeof model.modelName !== "string" ||
    typeof model.matchPattern !== "string" ||
    !Array.isArray(model.pricingTiers)
  ) {
    return;
  }
  const modelName = model.modelName.toLowerCase();
  const matchPattern = model.matchPattern.toLowerCase();
  const isGemini =
    modelName.includes("gemini") || matchPattern.includes("gemini");
  const isClaude =
    modelName.startsWith("claude-") ||
    matchPattern.includes("anthropic\\.claude");
  const isOpenAI =
    !isGemini &&
    !isClaude &&
    (model.tokenizerId === "openai" ||
      /^(chatgpt-|codex-|gpt-|o[0-9])/.test(modelName));

  for (const tier of model.pricingTiers) {
    if (!tier.prices || typeof tier.prices !== "object") continue;
    if (isOpenAI) {
      requireAliasFamily(
        model,
        tier,
        "OpenAI cache-read",
        ["input_cached_tokens", "input_cache_read", "cache_read_input_tokens"],
        false,
      );
      requireAliasFamily(
        model,
        tier,
        "OpenAI cache-write",
        ["input_cache_creation", "cache_write_tokens"],
        false,
      );
      requireAliasFamily(
        model,
        tier,
        "OpenAI reasoning",
        ["output_reasoning_tokens", "output_reasoning", "reasoning_tokens"],
        false,
      );
    } else if (isClaude) {
      requireAliasFamily(
        model,
        tier,
        "Anthropic input",
        ["input", "input_tokens"],
        true,
      );
      requireAliasFamily(
        model,
        tier,
        "Anthropic output",
        ["output", "output_tokens"],
        true,
      );
      requireAliasFamily(
        model,
        tier,
        "Anthropic cache-write",
        ["cache_creation_input_tokens", "input_cache_creation"],
        false,
      );
      requireAliasFamily(
        model,
        tier,
        "Anthropic cache-read",
        ["cache_read_input_tokens", "input_cache_read", "input_cached_tokens"],
        false,
      );
    } else if (isGemini) {
      requireAliasFamily(
        model,
        tier,
        "Gemini input",
        [
          "input",
          "input_text",
          "input_modality_1",
          "prompt_token_count",
          "promptTokenCount",
        ],
        true,
      );
      requireAliasFamily(
        model,
        tier,
        "Gemini output",
        [
          "output",
          "output_text",
          "output_modality_1",
          "candidates_token_count",
          "candidatesTokenCount",
        ],
        true,
      );
      requireAliasFamily(
        model,
        tier,
        "Gemini cache-read",
        ["input_cached_tokens", "cached_content_token_count"],
        false,
      );
      requireAliasFamily(
        model,
        tier,
        "Gemini reasoning",
        [
          "thoughts_token_count",
          "thoughtsTokenCount",
          "output_reasoning_tokens",
          "output_reasoning",
        ],
        false,
      );
    }
  }
}

const raw = await fs.readFile(filePath, "utf8");
const models = JSON.parse(raw);

if (!Array.isArray(models)) {
  throw new Error("Expected the pricing file to be a JSON array.");
}

const usageKeyModels = new Set(requestedUsageKeyModels);
if (baseFile) {
  const basePath = path.resolve(repoRoot, baseFile);
  const baseModels = JSON.parse(await fs.readFile(basePath, "utf8"));
  if (!Array.isArray(baseModels)) {
    throw new Error("Expected the base pricing file to be a JSON array.");
  }
  const baseByName = new Map(
    baseModels.map((model) => [model.modelName, JSON.stringify(model)]),
  );
  for (const model of models) {
    if (baseByName.get(model.modelName) !== JSON.stringify(model)) {
      usageKeyModels.add(model.modelName);
    }
  }
}

const availableModelNames = new Set(models.map((model) => model.modelName));
for (const modelName of requestedUsageKeyModels) {
  if (!availableModelNames.has(modelName)) {
    failures.push(
      `Unknown model requested for usage-key validation: ${modelName}`,
    );
  }
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

  if (usageKeyModels.has(model.modelName)) {
    validateUsageKeyCoverage(model);
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
if (usageKeyModels.size > 0) {
  console.log(
    `Validated usage-key coverage for ${usageKeyModels.size} changed or selected pricing entries.`,
  );
}
