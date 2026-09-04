import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = path.join(import.meta.dirname, "prepare-metadata.mjs");
const workflowPath = path.join(
  import.meta.dirname,
  "../../.github/workflows/model-price-audit.yml",
);

function runValidator({
  basePrices = [],
  currentPrices = basePrices,
  output,
  typesDiff = "",
  changedPricingJson = false,
  changedModelTypes = false,
}) {
  const fixtureDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "model-price-audit-metadata-"),
  );
  const files = {
    base: path.join(fixtureDirectory, "base.json"),
    current: path.join(fixtureDirectory, "current.json"),
    output: path.join(fixtureDirectory, "output.json"),
    typesDiff: path.join(fixtureDirectory, "types.diff"),
  };
  fs.writeFileSync(files.base, JSON.stringify(basePrices));
  fs.writeFileSync(files.current, JSON.stringify(currentPrices));
  fs.writeFileSync(files.output, JSON.stringify(output));
  fs.writeFileSync(files.typesDiff, typesDiff);

  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      BASE_PRICING_FILE: files.base,
      CHANGED_MODEL_TYPES: String(changedModelTypes),
      CHANGED_PRICING_JSON: String(changedPricingJson),
      CURRENT_PRICING_FILE: files.current,
      STRUCTURED_OUTPUT_PATH: files.output,
      TYPES_DIFF_FILE: files.typesDiff,
    },
  });
  fs.rmSync(fixtureDirectory, { force: true, recursive: true });
  return result;
}

const modelName = "gpt-5.5-2026-04-23";
const changedPrices = {
  before: [{ modelName, pricingTiers: [{ prices: { input: 5 } }] }],
  after: [{ modelName, pricingTiers: [{ prices: { input: 10 } }] }],
};

test("accepts an added pricing entry from the staged snapshot", () => {
  const addedModel = {
    modelName: "gpt-6-astra",
    pricingTiers: [{ prices: { input: 10, output: 50 } }],
  };
  const result = runValidator({
    basePrices: changedPrices.before,
    currentPrices: [...changedPrices.before, addedModel],
    changedPricingJson: true,
    output: {
      pullRequestTitle: "chore(pricing): add OpenAI gpt-6-astra pricing",
      modelsChecked: [{ model: addedModel.modelName, change: "added" }],
    },
  });

  assert.equal(result.status, 0, result.stderr);
});

test("accepts a unique trailing match-alias annotation", () => {
  const result = runValidator({
    basePrices: changedPrices.before,
    currentPrices: changedPrices.after,
    changedPricingJson: true,
    output: {
      pullRequestTitle: "chore(pricing): update gpt-5.5 large-context tier",
      modelsChecked: [
        {
          model: `${modelName} (also matches gpt-5.5)`,
          change: "updated",
        },
      ],
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    "chore(pricing): update gpt-5.5 large-context tier",
  );
});

test("accepts a concrete title for a reference-only diff", () => {
  const result = runValidator({
    output: {
      pullRequestTitle:
        "chore(pricing): confirm gpt-5 alias and Opus 4.5 evidence",
      modelsChecked: [{ model: modelName, change: "none" }],
    },
  });

  assert.equal(result.status, 0, result.stderr);
});

test("rejects an unrelated decorated model row", () => {
  const result = runValidator({
    basePrices: changedPrices.before,
    currentPrices: changedPrices.after,
    changedPricingJson: true,
    output: {
      pullRequestTitle: "chore(pricing): update gpt-5.5 large-context tier",
      modelsChecked: [
        {
          model: "gpt-5.4 (also matches gpt-5.5)",
          change: "updated",
        },
      ],
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /modelsChecked must report the actual updated pricing entry/,
  );
});

test("rejects a generic pull request title", () => {
  const result = runValidator({
    output: {
      pullRequestTitle: "chore(pricing): update model prices",
      modelsChecked: [{ model: modelName, change: "none" }],
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /must identify the specific models or audit behavior changed/,
  );
});

test("validates metadata against the exact staged pricing blob", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");
  const prepareStep = workflow.slice(
    workflow.indexOf("      - name: Prepare pull request artifact"),
    workflow.indexOf("      - name: Upload pull request artifact"),
  );
  const stageIndex = prepareStep.indexOf(
    'git -c core.hooksPath=/dev/null add -- "${changed_files[@]}"',
  );
  const metadataIndex = prepareStep.indexOf(
    "node scripts/model-price-audit/prepare-metadata.mjs",
  );

  assert.ok(stageIndex >= 0, "prepare step must stage the validated file list");
  assert.ok(
    stageIndex < metadataIndex,
    "metadata validation must run after staging",
  );
  assert.match(
    prepareStep,
    /CURRENT_PRICING_FILE="\$staged_pricing_file"/,
  );
  assert.doesNotMatch(prepareStep, /checkout -b "\$BOT_BRANCH"/);
});
