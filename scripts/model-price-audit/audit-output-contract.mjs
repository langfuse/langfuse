const officialSourceHosts = [
  "ai.google.dev",
  "aws.amazon.com",
  "azure.microsoft.com",
  "cloud.google.com",
  "developers.openai.com",
  "docs.anthropic.com",
  "platform.claude.com",
];

const normalize = (value) => value.trim().toLowerCase();

export const normalizeReportedModel = (value) =>
  normalize(value).replace(/\s+\((?:also\s+)?matches\b[^)]*\)$/u, "");

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};

const indexUniquePricingModels = (prices, label) => {
  const modelsByName = new Map();
  for (const item of prices) {
    const key = normalize(item.modelName);
    if (modelsByName.has(key)) {
      throw new Error(
        `${label} pricing contains duplicate normalized modelName: ${item.modelName}`,
      );
    }
    modelsByName.set(key, item);
  }
  return modelsByName;
};

export function collectPricingModelChanges(basePrices, currentPrices) {
  const baseByName = indexUniquePricingModels(basePrices, "Base");
  const currentByName = indexUniquePricingModels(currentPrices, "Current");
  const modelNames = Array.from(baseByName.keys()).concat(
    Array.from(currentByName.keys()),
  );
  const changes = [];

  for (const modelName of new Set(modelNames)) {
    const before = baseByName.get(modelName);
    const after = currentByName.get(modelName);
    if (!after) {
      changes.push({ modelName: before.modelName, expectedChange: "removed" });
    } else if (!before) {
      changes.push({ modelName: after.modelName, expectedChange: "added" });
    } else if (
      JSON.stringify(canonicalize(before)) !==
      JSON.stringify(canonicalize(after))
    ) {
      changes.push({ modelName: after.modelName, expectedChange: "updated" });
    }
  }

  return changes;
}

const selectableModelArrays = [
  {
    name: "openAIModels",
    pattern: /export const openAIModels = \[([\s\S]*?)\] as const;/u,
    provider: "OpenAI",
  },
  {
    name: "anthropicModels",
    pattern: /export const anthropicModels = \[([\s\S]*?)\] as const;/u,
    provider: "Anthropic",
  },
  {
    name: "vertexAIModels",
    pattern: /export const vertexAIModels = \[([\s\S]*?)\] as const;/u,
    provider: "Google",
  },
  {
    name: "googleAIStudioModels",
    pattern: /export const googleAIStudioModels = \[([\s\S]*?)\] as const;/u,
    provider: "Google",
  },
];

const readSelectableModelArrays = (source, label) =>
  new Map(
    selectableModelArrays.map(({ name, pattern, provider }) => {
      const match = source.match(pattern);
      if (!match) {
        throw new Error(`${label} types file is missing ${name}`);
      }
      const models = match[1]
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const modelMatch = line.match(/^"([^"]+)",(?:\s*\/\/.*)?$/u);
          if (!modelMatch) {
            throw new Error(
              `${label} ${name} contains an unsupported entry: ${line}`,
            );
          }
          return modelMatch[1];
        });
      const normalizedModels = models.map(normalize);
      if (new Set(normalizedModels).size !== normalizedModels.length) {
        throw new Error(`${label} ${name} contains duplicate model entries`);
      }
      return [name, { models, provider }];
    }),
  );

export function collectTypeModelChanges(baseTypes, currentTypes, typesDiff) {
  const baseArrays = readSelectableModelArrays(baseTypes, "Base");
  const currentArrays = readSelectableModelArrays(currentTypes, "Current");
  const changes = [];

  for (const { name } of selectableModelArrays) {
    const before = baseArrays.get(name);
    const after = currentArrays.get(name);
    if (before.models[0] !== after.models[0]) {
      throw new Error(`${name} must keep its first default model unchanged`);
    }

    let baseIndex = 0;
    const baseModelNames = new Set(before.models.map(normalize));
    for (const modelName of after.models) {
      if (normalize(before.models[baseIndex] ?? "") === normalize(modelName)) {
        baseIndex += 1;
      } else if (baseModelNames.has(normalize(modelName))) {
        throw new Error(`${name} may not reorder existing model entries`);
      } else {
        changes.push({
          arrayName: name,
          expectedChange: "added",
          modelName,
          provider: after.provider,
        });
      }
    }
    if (baseIndex !== before.models.length) {
      const currentModelNames = new Set(after.models.map(normalize));
      const removedModels = before.models.filter(
        (modelName) => !currentModelNames.has(normalize(modelName)),
      );
      throw new Error(
        `Automated selectable-model removal is not allowed: ${removedModels.join(", ")}`,
      );
    }
  }

  const additionsFromDiff = [];
  for (const line of typesDiff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (!line.startsWith("+") && !line.startsWith("-")) continue;

    const match = line.match(/^([+-])\s*"([^"]+)",(?:\s*\/\/.*)?$/u);
    if (!match) {
      throw new Error(
        `Selectable-model diff contains an unsupported changed line: ${line}`,
      );
    }

    const [, sign, modelName] = match;
    if (sign === "-") {
      throw new Error(
        `Automated selectable-model removal is not allowed: ${modelName}`,
      );
    }
    additionsFromDiff.push(normalize(modelName));
  }

  const semanticAdditions = changes.map((change) =>
    normalize(change.modelName),
  );
  additionsFromDiff.sort();
  semanticAdditions.sort();
  if (JSON.stringify(additionsFromDiff) !== JSON.stringify(semanticAdditions)) {
    throw new Error(
      "Selectable-model diff does not match additive changes in the approved model arrays",
    );
  }

  return changes;
}

export function mergeModelChanges(pricingChanges, typeModelChanges) {
  const changesByModel = new Map();
  for (const change of typeModelChanges) {
    changesByModel.set(normalize(change.modelName), change);
  }
  for (const change of pricingChanges) {
    changesByModel.set(normalize(change.modelName), change);
  }
  return Array.from(changesByModel.values());
}

export function validateOfficialSources(sources, model) {
  if (!Array.isArray(sources)) {
    throw new Error(`officialSources must be an array for ${model}`);
  }

  for (const source of sources) {
    const url = new URL(source);
    if (url.protocol !== "https:") {
      throw new Error(
        `Unsupported source URL protocol for ${model}: ${source}`,
      );
    }
    if (
      !officialSourceHosts.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    ) {
      throw new Error(
        `Source URL is not on an approved official domain for ${model}: ${source}`,
      );
    }
  }
}

export function validateChangedModelRow(row) {
  if (row.priceConfirmed !== "yes") {
    throw new Error(
      `Changed model rows require confirmed prices: ${row.model}`,
    );
  }
  if (row.usageKeyCoverageConfirmed !== "yes") {
    throw new Error(
      `Changed model rows require confirmed usage-key coverage: ${row.model}`,
    );
  }
  if (!["yes", "not_applicable"].includes(row.tieringCorrect)) {
    throw new Error(
      `Changed model rows require confirmed or inapplicable tiering: ${row.model}`,
    );
  }
  if (row.officialSources.length === 0) {
    throw new Error(
      `Changed model rows require an official source: ${row.model}`,
    );
  }
}

const appendComment = (row, message) => {
  const separator = row.comments.trim() ? " " : "";
  row.comments = `${row.comments.trim()}${separator}${message}`;
};

export function reconcileAuditOutput(
  rawOutput,
  {
    basePrices,
    currentPrices,
    baseTypes,
    currentTypes,
    hasRepositoryDiff,
    memorySnapshotOnly,
    typesDiff,
  },
) {
  const output = structuredClone(rawOutput);
  const warnings = [];

  if (
    !Array.isArray(output.modelsChecked) ||
    output.modelsChecked.length === 0
  ) {
    throw new Error(
      "modelsChecked must contain every model price checked during the audit",
    );
  }
  if (!Array.isArray(output.unresolvedFindings)) {
    throw new Error("unresolvedFindings must be an array");
  }

  if (memorySnapshotOnly && output.pullRequestTitle.trim() === "") {
    output.pullRequestTitle =
      "chore(pricing): record model price audit snapshot";
  }

  const modelKeys = new Set();
  for (const row of output.modelsChecked) {
    const key = `${row.provider}\u0000${row.model}`.toLowerCase();
    if (modelKeys.has(key)) {
      throw new Error(
        `Duplicate modelsChecked row: ${row.provider} / ${row.model}`,
      );
    }
    modelKeys.add(key);
    validateOfficialSources(row.officialSources, row.model);

    const unsupportedConfirmations = [];
    if (row.officialSources.length === 0) {
      if (row.priceConfirmed === "yes") unsupportedConfirmations.push("price");
      if (row.usageKeyCoverageConfirmed === "yes") {
        unsupportedConfirmations.push("usage-key coverage");
      }
      if (["yes", "not_applicable"].includes(row.tieringCorrect)) {
        unsupportedConfirmations.push("tiering applicability");
      }
    }

    if (unsupportedConfirmations.length > 0) {
      if (hasRepositoryDiff) {
        throw new Error(
          `Confirmed audit rows require an official source: ${row.model}`,
        );
      }
      if (row.priceConfirmed === "yes") row.priceConfirmed = "no";
      if (row.usageKeyCoverageConfirmed === "yes") {
        row.usageKeyCoverageConfirmed = "no";
      }
      if (["yes", "not_applicable"].includes(row.tieringCorrect)) {
        row.tieringCorrect = "no";
      }
      const warning = `${row.model}: ${unsupportedConfirmations.join(
        ", ",
      )} confirmation downgraded because no approved official source was provided.`;
      appendComment(row, warning);
      output.unresolvedFindings.push(warning);
      warnings.push(warning);
    }

    if (
      (row.priceConfirmed === "no" ||
        row.usageKeyCoverageConfirmed === "no" ||
        row.tieringCorrect === "no") &&
      !row.comments.trim()
    ) {
      throw new Error(`Unconfirmed audit rows require comments: ${row.model}`);
    }
  }

  const pricingChanges = collectPricingModelChanges(basePrices, currentPrices);
  const typeModelChanges = collectTypeModelChanges(
    baseTypes,
    currentTypes,
    typesDiff,
  );
  const removedPricingModels = pricingChanges.filter(
    (change) => change.expectedChange === "removed",
  );
  if (removedPricingModels.length > 0) {
    throw new Error(
      `Automated pricing-entry removal is not allowed: ${removedPricingModels
        .map((change) => change.modelName)
        .join(", ")}`,
    );
  }
  const rowsByModel = new Map();
  for (const row of output.modelsChecked) {
    const key = normalizeReportedModel(row.model);
    rowsByModel.set(key, [...(rowsByModel.get(key) ?? []), row]);
  }
  const expectedModelChanges = mergeModelChanges(
    pricingChanges,
    typeModelChanges,
  );
  const expectedChangesByModel = new Map(
    expectedModelChanges.map((change) => [normalize(change.modelName), change]),
  );

  for (const change of typeModelChanges) {
    const matchingRows = rowsByModel.get(normalize(change.modelName)) ?? [];
    if (
      matchingRows.length === 1 &&
      normalize(matchingRows[0].provider) !== normalize(change.provider)
    ) {
      throw new Error(
        `${change.arrayName} additions require provider ${change.provider}: ${change.modelName}`,
      );
    }
  }

  for (const change of expectedChangesByModel.values()) {
    const matchingRows = rowsByModel.get(normalize(change.modelName)) ?? [];
    if (matchingRows.length === 0) {
      throw new Error(
        `modelsChecked must report the actual ${change.expectedChange} model entry: ${change.modelName}`,
      );
    }
    if (matchingRows.length > 1) {
      throw new Error(
        `modelsChecked must report exactly one row for changed model: ${change.modelName}`,
      );
    }
    const [row] = matchingRows;
    row.change = change.expectedChange;
    validateChangedModelRow(row);
  }

  for (const row of output.modelsChecked) {
    if (!["added", "updated"].includes(row.change)) continue;
    if (expectedChangesByModel.has(normalizeReportedModel(row.model))) continue;

    if (hasRepositoryDiff) {
      throw new Error(
        `modelsChecked reports a model without a matching pricing or selectable-model diff: ${row.model}`,
      );
    }
    warnings.push(
      `${row.model}: reported ${row.change} without a repository diff; change reset to none.`,
    );
    row.change = "none";
  }

  output.changedModels = expectedModelChanges.map(
    (change) => `${change.modelName} (${change.expectedChange})`,
  );

  return { output, pricingChanges, typeModelChanges, warnings };
}

const escapeCell = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\r?\n/g, "<br>");

const list = (items) =>
  Array.isArray(items) && items.length > 0
    ? items.map((item) => `- ${String(item).replace(/\r?\n/g, " ")}`).join("\n")
    : "- None";

const sourceLinks = (sources) =>
  sources.length > 0
    ? sources
        .map((source, index) => {
          const href = new URL(source).href
            .replace(/\(/g, "%28")
            .replace(/\)/g, "%29");
          return `[${index + 1}](${href})`;
        })
        .join(" ")
    : "—";

export function renderAuditSummary(output) {
  const changeLabels = {
    none: "None",
    updated: "Updated",
    added: "Added",
    unresolved: "Unresolved",
  };
  const modelRows = output.modelsChecked.map((row) => {
    const priceConfirmed = row.priceConfirmed === "yes" ? "Yes" : "No";
    const usageKeyCoverageConfirmed =
      row.usageKeyCoverageConfirmed === "yes" ? "Yes" : "No";
    const tieringCorrect =
      row.tieringCorrect === "not_applicable"
        ? "N/A"
        : row.tieringCorrect === "yes"
          ? "Yes"
          : "No";
    return `| ${escapeCell(row.provider)} | ${escapeCell(row.model)} | ${escapeCell(row.pricingChecked)} | ${priceConfirmed} | ${escapeCell(row.usageKeysChecked)} | ${usageKeyCoverageConfirmed} | ${escapeCell(row.tieringChecked)} | ${tieringCorrect} | ${changeLabels[row.change]} | ${sourceLinks(row.officialSources)} | ${escapeCell(row.comments) || "—"} |`;
  });
  const proposedTitle = output.pullRequestTitle
    ? `\`${output.pullRequestTitle.replace(/`/g, "\\`")}\``
    : "_No repository diff proposed_";

  return [
    `**Audit date:** ${output.auditDate}`,
    `**Proposed pull request title:** ${proposedTitle}`,
    "",
    output.summary,
    "",
    "### Models checked",
    "",
    "| Provider | Model / pricing entry | Pricing checked | Price confirmed | Usage keys checked | Usage-key coverage | Tiering checked | Tiering correct | Change | Official source(s) | Comments |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...modelRows,
    "",
    "### Changed models",
    "",
    list(output.changedModels),
    "",
    "### Skill reference updates",
    "",
    list(output.skillReferenceUpdates),
    "",
    "### Workflow updates",
    "",
    list(output.workflowUpdates),
    "",
    "### Unresolved findings",
    "",
    list(output.unresolvedFindings),
    "",
    "### Validation",
    "",
    list(output.validation),
    "",
  ].join("\n");
}
