/** Which table column can filter each attribute. */

import { type FilterState } from "@langfuse/shared";

export type AttributeTarget = "observations" | "traces";

export type AttributeColumnFilter = {
  target: AttributeTarget;
  include: FilterState[number];
  /** Absent when the column has no exact negation. */
  exclude?: FilterState[number];
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

/** Keys absent here have no column, so they get no filter shortcut. */
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

export function attributeColumnFilter(
  key: string,
  value: string,
  target: AttributeTarget,
): AttributeColumnFilter | null {
  return ATTRIBUTE_COLUMNS[key]?.(value, target) ?? null;
}
