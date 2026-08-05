import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const validatorPath = new URL("./validate-pricing-file.mjs", import.meta.url);

function model({ id, modelName, matchPattern, tokenizerId = null, prices }) {
  return {
    id,
    modelName,
    matchPattern,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    tokenizerConfig: null,
    tokenizerId,
    pricingTiers: [
      {
        id: `${id}_tier_default`,
        name: "Standard",
        isDefault: true,
        priority: 0,
        conditions: [],
        prices,
      },
    ],
  };
}

async function runValidator(currentModels, baseModels) {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "pricing-validator-"),
  );
  const currentPath = path.join(temporaryDirectory, "current.json");
  const basePath = path.join(temporaryDirectory, "base.json");

  try {
    await Promise.all([
      writeFile(currentPath, JSON.stringify(currentModels)),
      writeFile(basePath, JSON.stringify(baseModels)),
    ]);
    return spawnSync(
      process.execPath,
      [validatorPath.pathname, currentPath, "--base", basePath],
      { encoding: "utf8" },
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

test("checks usage-key coverage only for changed pricing entries", async () => {
  const incompleteOpenAIModel = model({
    id: "openai-unchanged",
    modelName: "gpt-example",
    matchPattern: "(?i)^(openai/)?gpt-example$",
    tokenizerId: "openai",
    prices: {
      input: 1e-6,
      input_cached_tokens: 0.1e-6,
      input_cache_read: 0.1e-6,
      output: 5e-6,
      output_reasoning_tokens: 5e-6,
      output_reasoning: 5e-6,
    },
  });

  const unchangedResult = await runValidator(
    [incompleteOpenAIModel],
    [incompleteOpenAIModel],
  );
  assert.equal(unchangedResult.status, 0, unchangedResult.stderr);

  const changedResult = await runValidator(
    [
      {
        ...incompleteOpenAIModel,
        updatedAt: "2026-08-04T00:00:00.000Z",
      },
    ],
    [incompleteOpenAIModel],
  );
  assert.equal(changedResult.status, 1);
  assert.match(changedResult.stderr, /missing cache_read_input_tokens/);
  assert.match(changedResult.stderr, /missing reasoning_tokens/);
});

test("accepts complete OpenAI, Anthropic, Gemini, and generic Bedrock entries", async () => {
  const currentModels = [
    model({
      id: "openai-complete",
      modelName: "gpt-complete",
      matchPattern: "(?i)^(openai/)?gpt-complete$",
      tokenizerId: "openai",
      prices: {
        input: 1e-6,
        input_cached_tokens: 0.1e-6,
        input_cache_read: 0.1e-6,
        cache_read_input_tokens: 0.1e-6,
        input_cache_creation: 1.25e-6,
        cache_write_tokens: 1.25e-6,
        output: 5e-6,
        output_reasoning_tokens: 5e-6,
        output_reasoning: 5e-6,
        reasoning_tokens: 5e-6,
      },
    }),
    model({
      id: "anthropic-complete",
      modelName: "claude-complete",
      matchPattern: "(?i)^anthropic\\.claude-complete$",
      tokenizerId: "claude",
      prices: {
        input: 3e-6,
        input_tokens: 3e-6,
        output: 15e-6,
        output_tokens: 15e-6,
        cache_creation_input_tokens: 3.75e-6,
        input_cache_creation: 3.75e-6,
        input_cache_creation_5m: 3.75e-6,
        input_cache_creation_1h: 6e-6,
        cache_read_input_tokens: 0.3e-6,
        input_cache_read: 0.3e-6,
        input_cached_tokens: 0.3e-6,
      },
    }),
    model({
      id: "gemini-complete",
      modelName: "gemini-complete",
      matchPattern: "(?i)^gemini-complete$",
      prices: {
        input: 1e-6,
        input_text: 1e-6,
        input_modality_1: 1e-6,
        prompt_token_count: 1e-6,
        promptTokenCount: 1e-6,
        input_cached_tokens: 0.1e-6,
        cached_content_token_count: 0.1e-6,
        output: 5e-6,
        output_text: 5e-6,
        output_modality_1: 5e-6,
        candidates_token_count: 5e-6,
        candidatesTokenCount: 5e-6,
        thoughts_token_count: 5e-6,
        thoughtsTokenCount: 5e-6,
        output_reasoning_tokens: 5e-6,
        output_reasoning: 5e-6,
      },
    }),
    model({
      id: "bedrock-complete",
      modelName: "amazon-nova-complete",
      matchPattern: "(?i)^amazon-nova-complete$",
      prices: { input: 1e-6, output: 5e-6 },
    }),
  ];

  const result = await runValidator(currentModels, []);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Validated usage-key coverage for 4 changed or selected pricing entries/,
  );
});

test("rejects unequal prices within a semantic alias family", async () => {
  const result = await runValidator(
    [
      model({
        id: "openai-mismatch",
        modelName: "gpt-mismatch",
        matchPattern: "(?i)^(openai/)?gpt-mismatch$",
        tokenizerId: "openai",
        prices: {
          input: 1e-6,
          input_cached_tokens: 0.1e-6,
          input_cache_read: 0.1e-6,
          cache_read_input_tokens: 0.2e-6,
          output: 5e-6,
        },
      }),
    ],
    [],
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /cache-read aliases must have the same price/);
});

test("rejects an unknown explicitly selected model", () => {
  const result = spawnSync(
    process.execPath,
    [
      validatorPath.pathname,
      "worker/src/constants/default-model-prices.json",
      "--usage-key-model",
      "not-a-catalog-model",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Unknown model requested for usage-key validation: not-a-catalog-model/,
  );
});
