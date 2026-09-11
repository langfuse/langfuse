/**
 * Observation attributes: the fixed-key facts Langfuse knows (model,
 * environment, release, version, session, user). Rendered with the same
 * PrettyJsonView table as metadata; this module supplies the object to render
 * and the column-filter mapping its value menu uses. Model parameters are a
 * table of their own (`buildModelParameters`): they come from the LLM call,
 * not from Langfuse, and have no column to filter on.
 */

import { type FilterState, type JsonNested } from "@langfuse/shared";

export type AttributeTarget = "observations" | "traces";

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
  // SDK spelling (`session_id`, `user_id`); both are search-bar aliases.
  if (sessionId) attributes.session_id = sessionId;
  if (userId) attributes.user_id = userId;
  return attributes;
}

/** The LLM call's own parameters (temperature, tools, reasoning …), as sent by
 * the SDK. Null when there are none, so the table does not render empty. */
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

export type AttributeColumnFilter = {
  target: AttributeTarget;
  include: FilterState[number];
  /** Absent when the column has no exact negation (string columns only offer
      "does not contain", which would also hide "1.2.3" for "1.2"). */
  exclude?: FilterState[number];
};

/**
 * Maps an attribute to the table column that can filter on it. Model only
 * exists on observations; release only on traces; environment, version,
 * session and user on both, so those follow the caller's target. Model
 * parameters have no column.
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
