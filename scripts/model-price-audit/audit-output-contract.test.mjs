import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  collectTypeModelChanges,
  renderAuditSummary,
} from "./audit-output-contract.mjs";

const scriptPath = path.join(
  import.meta.dirname,
  "validate-and-render-audit-output.mjs",
);
const workflowPath = path.join(
  import.meta.dirname,
  "../../.github/workflows/model-price-audit.yml",
);
const repositoryTypesPath = path.join(
  import.meta.dirname,
  "../../packages/shared/src/server/llm/types.ts",
);

const officialSource = "https://developers.openai.com/api/docs/pricing";

const pricingEntry = (modelName, inputPrice = 1) => ({
  modelName,
  pricingTiers: [{ prices: { input: inputPrice } }],
});

const auditRow = ({
  model,
  change = "none",
  priceConfirmed = "yes",
  usageKeyCoverageConfirmed = "yes",
  tieringCorrect = "not_applicable",
  officialSources = [officialSource],
  comments = "Confirmed from the official pricing page.",
}) => ({
  provider: "OpenAI",
  model,
  pricingChecked: "Input pricing",
  priceConfirmed,
  usageKeysChecked: "input",
  usageKeyCoverageConfirmed,
  tieringChecked: "No tiering applies",
  tieringCorrect,
  change,
  officialSources,
  comments,
});

const structuredOutput = (modelsChecked) => ({
  summary: "Audit complete.",
  auditDate: "2026-09-04",
  pullRequestTitle: "",
  modelsChecked,
  changedModels: [],
  skillReferenceUpdates: [],
  workflowUpdates: [],
  unresolvedFindings: [],
  validation: [],
});

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

function runContract({
  baseTypes = typesSource(),
  basePrices = [],
  currentTypes = baseTypes,
  currentPrices = basePrices,
  output,
  typesDiff = "",
}) {
  const fixtureDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "model-price-audit-output-"),
  );
  const basePath = path.join(fixtureDirectory, "base.json");
  const currentPath = path.join(fixtureDirectory, "current.json");
  const baseTypesPath = path.join(fixtureDirectory, "base-types.ts");
  const currentTypesPath = path.join(fixtureDirectory, "current-types.ts");
  const normalizedOutputPath = path.join(fixtureDirectory, "output.json");
  const typesDiffPath = path.join(fixtureDirectory, "types.diff");
  fs.writeFileSync(basePath, JSON.stringify(basePrices));
  fs.writeFileSync(currentPath, JSON.stringify(currentPrices));
  fs.writeFileSync(baseTypesPath, baseTypes);
  fs.writeFileSync(currentTypesPath, currentTypes);
  fs.writeFileSync(typesDiffPath, typesDiff);

  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      BASE_PRICING_FILE: basePath,
      BASE_TYPES_FILE: baseTypesPath,
      CURRENT_PRICING_FILE: currentPath,
      CURRENT_TYPES_FILE: currentTypesPath,
      HAS_REPOSITORY_DIFF: String(
        JSON.stringify(basePrices) !== JSON.stringify(currentPrices) ||
          typesDiff.length > 0,
      ),
      MEMORY_SNAPSHOT_ONLY: "false",
      STRUCTURED_OUTPUT: JSON.stringify(output),
      STRUCTURED_OUTPUT_PATH: normalizedOutputPath,
      TYPES_DIFF_FILE: typesDiffPath,
    },
  });
  const normalizedOutput = fs.existsSync(normalizedOutputPath)
    ? JSON.parse(fs.readFileSync(normalizedOutputPath, "utf8"))
    : null;
  fs.rmSync(fixtureDirectory, { force: true, recursive: true });
  return { normalizedOutput, result };
}

test("downgrades unsupported confirmation claims on a no-diff audit", () => {
  const model = "gpt-4o-2024-05-13";
  const { normalizedOutput, result } = runContract({
    output: structuredOutput([
      auditRow({
        model,
        priceConfirmed: "no",
        usageKeyCoverageConfirmed: "yes",
        officialSources: [],
        comments: "Not independently re-fetched during this run.",
      }),
    ]),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    normalizedOutput.modelsChecked[0].usageKeyCoverageConfirmed,
    "no",
  );
  assert.equal(normalizedOutput.modelsChecked[0].tieringCorrect, "no");
  assert.match(
    normalizedOutput.modelsChecked[0].comments,
    /downgraded because no approved official source was provided/i,
  );
  assert.match(normalizedOutput.unresolvedFindings[0], new RegExp(model));
  assert.match(result.stderr, /::warning::/);
  assert.match(result.stdout, /gpt-4o-2024-05-13/);
});

test("rejects a changed pricing entry without confirmed prices", () => {
  const model = "gpt-6-astra";
  const { result } = runContract({
    basePrices: [],
    currentPrices: [pricingEntry(model)],
    output: {
      ...structuredOutput([
        auditRow({ model, change: "added", priceConfirmed: "no" }),
      ]),
      pullRequestTitle: "chore(pricing): add gpt-6-astra pricing",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Changed model rows require confirmed prices: gpt-6-astra/,
  );
});

test("derives changed pricing metadata from the semantic diff", () => {
  const model = "gpt-6-astra";
  const { normalizedOutput, result } = runContract({
    basePrices: [],
    currentPrices: [pricingEntry(model)],
    output: {
      ...structuredOutput([auditRow({ model, change: "none" })]),
      pullRequestTitle: "chore(pricing): add gpt-6-astra pricing",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(normalizedOutput.modelsChecked[0].change, "added");
  assert.deepEqual(normalizedOutput.changedModels, [`${model} (added)`]);
});

test("rejects automated pricing-entry removal", () => {
  const model = "gpt-4o";
  const { result } = runContract({
    basePrices: [pricingEntry(model)],
    currentPrices: [],
    output: {
      ...structuredOutput([auditRow({ model, change: "updated" })]),
      pullRequestTitle: "chore(pricing): remove gpt-4o pricing",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Automated pricing-entry removal is not allowed: gpt-4o/,
  );
});

test("ignores object-key ordering when deriving changed pricing metadata", () => {
  const unchangedBefore = {
    modelName: "gpt-4o",
    pricingTiers: [{ prices: { input: 1, output: 2 }, priority: 0 }],
  };
  const unchangedAfter = {
    pricingTiers: [{ priority: 0, prices: { output: 2, input: 1 } }],
    modelName: "gpt-4o",
  };
  const changedBefore = pricingEntry("gpt-6-astra", 1);
  const changedAfter = pricingEntry("gpt-6-astra", 2);
  const { normalizedOutput, result } = runContract({
    basePrices: [unchangedBefore, changedBefore],
    currentPrices: [unchangedAfter, changedAfter],
    output: {
      ...structuredOutput([
        auditRow({ model: "gpt-4o" }),
        auditRow({ model: "gpt-6-astra", change: "updated" }),
      ]),
      pullRequestTitle: "chore(pricing): update gpt-6-astra pricing",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(normalizedOutput.changedModels, ["gpt-6-astra (updated)"]);
});

test("reconciles a selectable-model-only addition", () => {
  const model = "gpt-6-astra";
  const { normalizedOutput, result } = runContract({
    basePrices: [pricingEntry(model)],
    currentTypes: typesSource({ openAI: ["gpt-4o", model] }),
    output: {
      ...structuredOutput([auditRow({ model, change: "none" })]),
      pullRequestTitle: "chore(pricing): expose gpt-6-astra in playground",
    },
    typesDiff: `+  "${model}",\n`,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(normalizedOutput.modelsChecked[0].change, "added");
  assert.deepEqual(normalizedOutput.changedModels, [`${model} (added)`]);
});

test("rejects changing a selectable array default model", () => {
  const model = "gpt-6-astra";
  const { result } = runContract({
    basePrices: [pricingEntry(model)],
    currentTypes: typesSource({ openAI: [model, "gpt-4o"] }),
    output: {
      ...structuredOutput([auditRow({ model, change: "added" })]),
      pullRequestTitle: "chore(pricing): expose gpt-6-astra in playground",
    },
    typesDiff: `+  "${model}",\n`,
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /openAIModels must keep its first default model unchanged/,
  );
});

test("rejects a selectable model added to the wrong provider array", () => {
  const model = "gpt-6-astra";
  const { result } = runContract({
    basePrices: [pricingEntry(model)],
    currentTypes: typesSource({ anthropic: ["claude-3", model] }),
    output: {
      ...structuredOutput([auditRow({ model, change: "added" })]),
      pullRequestTitle: "chore(pricing): expose gpt-6-astra in playground",
    },
    typesDiff: `+  "${model}",\n`,
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /anthropicModels additions require provider Anthropic: gpt-6-astra/,
  );
});

test("uses the pricing delta when the same model also becomes selectable", () => {
  const model = "gpt-6-astra";
  const { normalizedOutput, result } = runContract({
    basePrices: [pricingEntry(model, 1)],
    currentPrices: [pricingEntry(model, 2)],
    currentTypes: typesSource({ openAI: ["gpt-4o", model] }),
    output: {
      ...structuredOutput([auditRow({ model, change: "added" })]),
      pullRequestTitle: "chore(pricing): update and expose gpt-6-astra",
    },
    typesDiff: `+  "${model}",\n`,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(normalizedOutput.modelsChecked[0].change, "updated");
  assert.deepEqual(normalizedOutput.changedModels, [`${model} (updated)`]);
});

test("rejects automated selectable-model removal", () => {
  const model = "gpt-4o";
  const { result } = runContract({
    baseTypes: typesSource({ openAI: ["gpt-4.1", model] }),
    basePrices: [pricingEntry(model)],
    currentTypes: typesSource({ openAI: ["gpt-4.1"] }),
    output: {
      ...structuredOutput([auditRow({ model, change: "updated" })]),
      pullRequestTitle: "chore(pricing): remove gpt-4o from playground",
    },
    typesDiff: `-  "${model}",\n`,
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Automated selectable-model removal is not allowed: gpt-4o/,
  );
});

test("rejects remove-plus-add selectable-model edits", () => {
  const model = "gpt-4o";
  const { result } = runContract({
    basePrices: [pricingEntry(model)],
    output: {
      ...structuredOutput([auditRow({ model, change: "updated" })]),
      pullRequestTitle: "chore(pricing): reorder gpt-4o in playground",
    },
    typesDiff: `-  "${model}",\n+  "${model}",\n`,
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Automated selectable-model removal is not allowed: gpt-4o/,
  );
});

test("rejects unrelated changes in the selectable-model file", () => {
  const model = "gpt-6-astra";
  const { result } = runContract({
    basePrices: [pricingEntry(model)],
    currentTypes: typesSource({ openAI: ["gpt-4o", model] }),
    output: {
      ...structuredOutput([auditRow({ model, change: "added" })]),
      pullRequestTitle: "chore(pricing): expose gpt-6-astra in playground",
    },
    typesDiff: `+  "${model}",\n+export const unrelated = true;\n`,
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Selectable-model diff contains an unsupported changed line/,
  );
});

test("rejects case-insensitive pricing model collisions", () => {
  const model = "gpt-4o";
  const { result } = runContract({
    basePrices: [pricingEntry(model)],
    currentPrices: [pricingEntry(model), pricingEntry("GPT-4O")],
    output: {
      ...structuredOutput([auditRow({ model, change: "updated" })]),
      pullRequestTitle: "chore(pricing): update gpt-4o pricing",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Current pricing contains duplicate normalized modelName: GPT-4O/,
  );
});

test("rejects ambiguous evidence rows for a changed model", () => {
  const model = "gpt-6-astra";
  const { result } = runContract({
    currentPrices: [pricingEntry(model)],
    output: {
      ...structuredOutput([
        auditRow({ model }),
        { ...auditRow({ model }), provider: "Azure OpenAI" },
      ]),
      pullRequestTitle: "chore(pricing): add gpt-6-astra pricing",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /modelsChecked must report exactly one row for changed model: gpt-6-astra/,
  );
});

test("clears model-controlled changedModels for non-model diffs", () => {
  const model = "gpt-4o";
  const { normalizedOutput, result } = runContract({
    basePrices: [pricingEntry(model)],
    output: {
      ...structuredOutput([auditRow({ model })]),
      changedModels: ["invented-model (added)"],
      pullRequestTitle: "chore(pricing): tighten audit workflow contract",
    },
    typesDiff: "diff --git a/reference.md b/reference.md\n",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(normalizedOutput.changedModels, []);
});

test("parses the checked-in selectable-model arrays", () => {
  const types = fs.readFileSync(repositoryTypesPath, "utf8");
  assert.deepEqual(collectTypeModelChanges(types, types, ""), []);
});

test("escapes backslashes and backticks in the proposed title", () => {
  const output = {
    ...structuredOutput([auditRow({ model: "gpt-4o" })]),
    pullRequestTitle: "chore(pricing): check \\ path and `code`",
  };

  assert.match(
    renderAuditSummary(output),
    /chore\(pricing\): check \\\\ path and \\`code\\`/,
  );
});

test("runs formatting cleanup before the extracted output contract", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");
  const cleanupIndex = workflow.indexOf(
    "      - name: Discard pricing-only formatting changes",
  );
  const summaryIndex = workflow.indexOf("      - name: Write audit summary");

  assert.ok(cleanupIndex >= 0, "workflow must clean up formatting-only diffs");
  assert.ok(
    cleanupIndex < summaryIndex,
    "semantic cleanup must run before report reconciliation",
  );
  assert.match(
    workflow,
    /node scripts\/model-price-audit\/validate-and-render-audit-output\.mjs/,
  );
  assert.match(
    workflow,
    /run: node --test scripts\/model-price-audit\/\*\.test\.mjs/,
  );
  assert.doesNotMatch(workflow, /node <<'NODE' \| tee/);
});
