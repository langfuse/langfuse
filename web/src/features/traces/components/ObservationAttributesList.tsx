/**
 * Observation attributes: the fixed-key facts Langfuse knows (model,
 * environment, release, version, model parameters). Rendered with the same
 * PrettyJsonView table as metadata; this module supplies the object to render
 * and the column-filter mapping its value menu uses.
 */

import { type FilterState, type JsonNested } from "@langfuse/shared";

export type AttributeTarget = "observations" | "traces";

export function buildObservationAttributes({
  model,
  environment,
  release,
  version,
  modelParameters,
}: {
  model: string | null;
  environment: string | null;
  release: string | null | undefined;
  version: string | null;
  modelParameters: JsonNested | null | undefined;
}): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  if (model) attributes.model = model;
  if (environment) attributes.environment = environment;
  if (release) attributes.release = release;
  if (version) attributes.version = version;
  if (
    modelParameters &&
    typeof modelParameters === "object" &&
    !Array.isArray(modelParameters)
  ) {
    for (const [key, value] of Object.entries(modelParameters)) {
      // Fixed attributes win: a parameter that happens to be called `model`
      // or `version` must not replace the observation's own value.
      if (value === null || value === undefined || key in attributes) continue;
      attributes[key] = value;
    }
  }
  return attributes;
}

export type AttributeColumnFilter = {
  target: AttributeTarget;
  include: FilterState[number];
  exclude: FilterState[number];
};

/**
 * Maps an attribute to the table column that can filter on it. Model only
 * exists on observations; release only on traces; environment and version on
 * both, so those follow the caller's target. Model parameters have no column.
 */
export function attributeColumnFilter(
  key: string,
  value: string,
  target: AttributeTarget,
): AttributeColumnFilter | null {
  const options = (column: string, t: AttributeTarget) => ({
    target: t,
    include: {
      column,
      type: "stringOptions" as const,
      operator: "any of" as const,
      value: [value],
    },
    exclude: {
      column,
      type: "stringOptions" as const,
      operator: "none of" as const,
      value: [value],
    },
  });
  const text = (column: string, t: AttributeTarget) => ({
    target: t,
    include: {
      column,
      type: "string" as const,
      operator: "=" as const,
      value,
    },
    exclude: {
      column,
      type: "string" as const,
      operator: "does not contain" as const,
      value,
    },
  });
  switch (key) {
    case "environment":
      return options("environment", target);
    case "model":
      return options("model", "observations");
    case "version":
      return text("version", target);
    case "release":
      // Observations have no release column; filtering the traces table by
      // an observation's release could point at a different record.
      return target === "traces" ? text("release", "traces") : null;
    default:
      return null;
  }
}

/** Search-bar grammar for a key/value pair; the value is quoted when it would
 * not survive as one bare token. */
export function attributeGrammar(key: string, value: string): string {
  const v = /[\s:"()]/.test(value) ? JSON.stringify(value) : value;
  return `${key}:${v}`;
}
