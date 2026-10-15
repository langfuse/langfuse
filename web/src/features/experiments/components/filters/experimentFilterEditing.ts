import { singleFilter, type FilterState } from "@langfuse/shared";

export const EXPERIMENT_FILTER_KINDS = [
  { column: "level", type: "stringOptions", label: "Status" },
  { column: "scores_avg", type: "numberObject", label: "Numeric score" },
  {
    column: "score_categories",
    type: "categoryOptions",
    label: "Categorical score",
  },
  { column: "score_booleans", type: "booleanObject", label: "Boolean score" },
  { column: "itemMetadata", type: "stringObject", label: "Item metadata" },
  { column: "eventMetadata", type: "stringObject", label: "Metadata" },
] as const;

export type ExperimentFilterDraft = {
  column: string;
  type: FilterState[number]["type"];
  target: string;
  operator: string;
  key: string;
  value: string | string[];
};

export function newExperimentFilterDraft(
  column: string,
): ExperimentFilterDraft {
  const kind = EXPERIMENT_FILTER_KINDS.find((entry) => entry.column === column);
  if (!kind) throw new Error(`Unknown experiment filter column: ${column}`);
  const optionsType =
    kind.type === "stringOptions" || kind.type === "categoryOptions";
  return {
    column,
    type: kind.type,
    target: "all",
    operator: optionsType ? "any of" : "=",
    key: "",
    value: optionsType ? [] : "",
  };
}

export function experimentFilterToDraft(
  filter: FilterState[number],
  legacyDefaultTarget = "baseline",
): ExperimentFilterDraft {
  return {
    column: filter.column,
    type: filter.type,
    target: filter.target ?? legacyDefaultTarget,
    operator: filter.operator,
    key: "key" in filter ? filter.key : "",
    value: Array.isArray(filter.value)
      ? filter.value
      : String(filter.value ?? ""),
  };
}

/** Incomplete editor values never become an applied condition. */
export function completeExperimentFilter(
  draft: ExperimentFilterDraft,
): FilterState[number] | null {
  const keyed = [
    "numberObject",
    "booleanObject",
    "categoryOptions",
    "stringObject",
  ].includes(draft.type);
  if (keyed && draft.key.length === 0) return null;
  const presence =
    draft.type === "stringObject" &&
    ["is set", "is not set"].includes(draft.operator);
  if (
    !presence &&
    (Array.isArray(draft.value)
      ? draft.value.length === 0
      : draft.value.trim() === "")
  )
    return null;
  let value: unknown = draft.value;
  if (draft.type === "numberObject" || draft.type === "number") {
    value = Number(draft.value);
    if (!Number.isFinite(value)) return null;
  } else if (draft.type === "booleanObject" || draft.type === "boolean") {
    if (draft.value !== "true" && draft.value !== "false") return null;
    value = draft.value === "true";
  } else if (presence) value = "";
  const result = singleFilter.safeParse({
    ...draft,
    ...(keyed ? { key: draft.key } : {}),
    value,
  });
  return result.success ? result.data : null;
}

/** Address the occurrence, not the column/key/target: identical predicates may coexist. */
export function editExperimentFilter(
  filters: FilterState,
  index: number,
  replacement: FilterState[number] | null,
): FilterState {
  if (index < 0 || index >= filters.length) return filters;
  return filters.flatMap((filter, currentIndex) => {
    if (currentIndex !== index) return [filter];
    return replacement ? [replacement] : [];
  });
}
