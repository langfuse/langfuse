import { type ExperimentFilterOptions } from "./experimentFilterTypes";
import {
  completeExperimentFilter,
  EXPERIMENT_FILTER_KINDS,
  newExperimentFilterDraft,
  type ExperimentFilterDraft,
} from "./experimentFilterEditing";

export function experimentFilterCreationChoices(
  options: ExperimentFilterOptions | undefined,
  optionsError: string | null,
) {
  return EXPERIMENT_FILTER_KINDS.map(function prepareChoice(kind) {
    const draft = prepareDefaultDraft(kind.column, options);
    const metadataColumn = kind.type === "stringObject" ? kind.column : null;
    const filter = completeExperimentFilter(draft);
    return {
      ...kind,
      filter,
      metadataColumn,
      description: describeDefault(draft, options, optionsError),
      levels: defaultScoreLevels(draft, options),
      isDisabled: !metadataColumn && !filter,
    };
  });
}

function prepareDefaultDraft(
  column: (typeof EXPERIMENT_FILTER_KINDS)[number]["column"],
  options: ExperimentFilterOptions | undefined,
): ExperimentFilterDraft {
  const draft = newExperimentFilterDraft(column);
  switch (column) {
    case "level":
      return { ...draft, value: ["DEFAULT"] };
    case "scores_avg": {
      const nonNumericNames = new Set([
        ...(options?.score_booleans ?? []),
        ...Object.keys(options?.score_categories ?? {}),
      ]);
      const key =
        options?.scores_avg?.find(
          (name) => name.length > 0 && !nonNumericNames.has(name),
        ) ?? "";
      return { ...draft, key, operator: ">=", value: "0" };
    }
    case "score_booleans":
      return {
        ...draft,
        key: options?.score_booleans?.find((name) => name.length > 0) ?? "",
        value: "true",
      };
    case "score_categories": {
      const category = Object.entries(options?.score_categories ?? {}).find(
        ([name, values]) => name.length > 0 && values.length > 0,
      );
      return {
        ...draft,
        key: category?.[0] ?? "",
        value: category ? [category[1][0]] : [],
      };
    }
    case "itemMetadata":
    case "eventMetadata":
      return draft;
  }
}

function describeDefault(
  draft: ExperimentFilterDraft,
  options: ExperimentFilterOptions | undefined,
  optionsError: string | null,
): string {
  if (draft.type === "stringObject") return "Choose a key · is set";
  if (draft.column === "level") return "DEFAULT";
  if (completeExperimentFilter(draft)) {
    const value = Array.isArray(draft.value)
      ? JSON.stringify(draft.value[0])
      : draft.value;
    return `${draft.key} ${draft.operator} ${value}`;
  }
  if (optionsError) return "Score options unavailable";
  return options ? "No scores of this type" : "Loading scores…";
}

function defaultScoreLevels(
  draft: ExperimentFilterDraft,
  options: ExperimentFilterOptions | undefined,
) {
  if (draft.type === "numberObject")
    return options?.score_name_levels_numeric?.[draft.key] ?? [];
  if (draft.type === "categoryOptions")
    return options?.score_name_levels_categorical?.[draft.key] ?? [];
  if (draft.type === "booleanObject")
    return options?.score_name_levels_boolean?.[draft.key] ?? [];
  return [];
}

export type ExperimentFilterCreationChoice = ReturnType<
  typeof experimentFilterCreationChoices
>[number];
