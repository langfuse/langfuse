/** Builds the objects behind the Attributes and Model parameters tables. */

import { type FilterState, type JsonNested } from "@langfuse/shared";

export function buildObservationAttributes({
  model,
  environment,
  release,
  version,
  sessionId,
  userId,
}: {
  model: string | null;
  environment: string | null;
  release: string | null | undefined;
  version: string | null;
  /** Trace-level; v4 events carry them on every observation. */
  sessionId?: string | null;
  userId?: string | null;
}): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  if (model) attributes.model = model;
  if (environment) attributes.environment = environment;
  if (release) attributes.release = release;
  if (version) attributes.version = version;
  // SDK spelling; both are search-bar aliases.
  if (sessionId) attributes.session_id = sessionId;
  if (userId) attributes.user_id = userId;
  return attributes;
}

/** Null when empty, so the table does not render. */
export function buildModelParameters(
  modelParameters: JsonNested | null | undefined,
): Record<string, unknown> | null {
  if (
    !modelParameters ||
    typeof modelParameters !== "object" ||
    Array.isArray(modelParameters)
  )
    return null;
  const entries = Object.entries(modelParameters).filter(
    ([, value]) => value !== null && value !== undefined,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

export type AttributeTarget = "observations" | "traces";

export type AttributeColumnFilter = {
  target: AttributeTarget;
  include: FilterState[number];
  /** Absent when the column has no exact negation. */
  exclude?: FilterState[number];
};

/**
 * Which table column can filter each attribute. Keys absent from the map have
 * no column, so they get no filter shortcut.
 */
const ATTRIBUTE_COLUMNS: Record<
  string,
  (value: string, target: AttributeTarget) => AttributeColumnFilter | null
> = {
  environment: (value, target) => optionsFilter("environment", value, target),
  // Traces have no model column.
  model: (value) => optionsFilter("model", value, "observations"),
  session_id: (value, target) => optionsFilter("sessionId", value, target),
  user_id: (value, target) => optionsFilter("userId", value, target),
  version: (value, target) => textFilter("version", value, target),
  // Observations have no release column, and an observation's release could
  // belong to a different trace record.
  release: (value, target) =>
    target === "traces" ? textFilter("release", value, "traces") : null,
};

function optionsFilter(
  column: string,
  value: string,
  target: AttributeTarget,
): AttributeColumnFilter {
  return {
    target,
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
  };
}

function textFilter(
  column: string,
  value: string,
  target: AttributeTarget,
): AttributeColumnFilter {
  return {
    target,
    include: {
      column,
      type: "string" as const,
      operator: "=" as const,
      value,
    },
  };
}

export function attributeColumnFilter(
  key: string,
  value: string,
  target: AttributeTarget,
): AttributeColumnFilter | null {
  return ATTRIBUTE_COLUMNS[key]?.(value, target) ?? null;
}

/** Search-bar grammar for a key/value pair. */
export function attributeGrammar(key: string, value: string): string {
  const v = /[\s:"()]/.test(value) ? JSON.stringify(value) : value;
  return `${key}:${v}`;
}
