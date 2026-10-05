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

const typesSource = ({
  anthropic = ["claude-3"],
  googleAIStudio = ["gemini-2"],
  openAI = ["gpt-4o"],
  vertexAI = ["gemini-2"],
} = {}) => `
export const openAIModels = [
${openAI.map((model) => `  "${model}",`).join("\n")}
] as const;
export const anthropicModels = [
${anthropic.map((model) => `  "${model}",`).join("\n")}
] as const;
export const vertexAIModels = [
${vertexAI.map((model) => `  "${model}",`).join("\n")}
] as const;
export const googleAIStudioModels = [
${googleAIStudio.map((model) => `  "${model}",`).join("\n")}
] as const;
`;

function runValidator({
  baseTypes = typesSource(),
  basePrices = [],
  currentTypes = baseTypes,
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
    baseTypes: path.join(fixtureDirectory, "base-types.ts"),
    current: path.join(fixtureDirectory, "current.json"),
    currentTypes: path.join(fixtureDirectory, "current-types.ts"),
    output: path.join(fixtureDirectory, "output.json"),
    typesDiff: path.join(fixtureDirectory, "types.diff"),
  };
  fs.writeFileSync(files.base, JSON.stringify(basePrices));
  fs.writeFileSync(files.baseTypes, baseTypes);
  fs.writeFileSync(files.current, JSON.stringify(currentPrices));
  fs.writeFileSync(files.currentTypes, currentTypes);
  fs.writeFileSync(files.output, JSON.stringify(output));
  fs.writeFileSync(files.typesDiff, typesDiff);

  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      BASE_PRICING_FILE: files.base,
      BASE_TYPES_FILE: files.baseTypes,
      CHANGED_MODEL_TYPES: String(changedModelTypes),
      CHANGED_PRICING_JSON: String(changedPricingJson),
      CURRENT_PRICING_FILE: files.current,
      CURRENT_TYPES_FILE: files.currentTypes,
      STRUCTURED_OUTPUT_PATH: files.output,
      TYPES_DIFF_FILE: files.typesDiff,
    },
  });
  fs.rmSync(fixtureDirectory, { force: true, recursive: true });
  return result;
}

const modelName = "gpt-5.5-2026-04-23";
const confirmedChange = (model, change) => ({
  provider: "OpenAI",
  model,
  change,
  priceConfirmed: "yes",
  usageKeyCoverageConfirmed: "yes",
  tieringCorrect: "not_applicable",
  officialSources: ["https://developers.openai.com/api/docs/pricing"],
});
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
      modelsChecked: [confirmedChange(addedModel.modelName, "added")],
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
        confirmedChange(`${modelName} (also matches gpt-5.5)`, "updated"),
      ],
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    "chore(pricing): update gpt-5.5 large-context tier",
  );
});

test("accepts a selectable-model-only addition with confirmed evidence", () => {
  const selectableModel = "gpt-6-astra";
  const result = runValidator({
    basePrices: [{ modelName: selectableModel }],
    changedModelTypes: true,
    currentTypes: typesSource({ openAI: ["gpt-4o", selectableModel] }),
    output: {
      pullRequestTitle: "chore(pricing): expose gpt-6-astra in playground",
      modelsChecked: [confirmedChange(selectableModel, "added")],
    },
    typesDiff: `+  "${selectableModel}",\n`,
  });

  assert.equal(result.status, 0, result.stderr);
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
    /modelsChecked must report the actual updated model entry/,
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

test("revalidates changed-entry evidence from the staged snapshot", () => {
  const result = runValidator({
    basePrices: changedPrices.before,
    currentPrices: changedPrices.after,
    changedPricingJson: true,
    output: {
      pullRequestTitle: "chore(pricing): update gpt-5.5 pricing",
      modelsChecked: [
        {
          ...confirmedChange(modelName, "updated"),
          priceConfirmed: "no",
        },
      ],
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Changed model rows require confirmed prices: gpt-5.5-2026-04-23/,
  );
});

test("rejects pricing-entry removal from the staged snapshot", () => {
  const result = runValidator({
    basePrices: changedPrices.before,
    currentPrices: [],
    changedPricingJson: true,
    output: {
      pullRequestTitle: "chore(pricing): remove gpt-5.5 pricing",
      modelsChecked: [confirmedChange(modelName, "updated")],
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Automated pricing-entry removal is not allowed: gpt-5.5-2026-04-23/,
  );
});

test("rejects selectable-model removal from the staged snapshot", () => {
  const result = runValidator({
    baseTypes: typesSource({ openAI: ["gpt-4o", modelName] }),
    basePrices: changedPrices.before,
    changedModelTypes: true,
    currentTypes: typesSource(),
    output: {
      pullRequestTitle: "chore(pricing): remove gpt-5.5 from playground",
      modelsChecked: [confirmedChange(modelName, "updated")],
    },
    typesDiff: `-  "${modelName}",\n`,
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Automated selectable-model removal is not allowed: gpt-5.5-2026-04-23/,
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
  assert.match(prepareStep, /CURRENT_PRICING_FILE="\$staged_pricing_file"/);
  assert.match(prepareStep, /CURRENT_TYPES_FILE="\$staged_types_file"/);
  assert.doesNotMatch(prepareStep, /checkout -b "\$BOT_BRANCH"/);
});
