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

/** Maps an attribute to the table column that can filter on it. */
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
  });
  switch (key) {
    case "environment":
      return options("environment", target);
    case "model":
      return options("model", "observations");
    case "session_id":
      return options("sessionId", target);
    case "user_id":
      return options("userId", target);
    case "version":
      return text("version", target);
    case "release":
      // Observations have no release column.
      return target === "traces" ? text("release", "traces") : null;
    default:
      return null;
  }
}

/** Search-bar grammar for a key/value pair. */
export function attributeGrammar(key: string, value: string): string {
  const v = /[\s:"()]/.test(value) ? JSON.stringify(value) : value;
  return `${key}:${v}`;
}
