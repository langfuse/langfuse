import { useMemo } from "react";

import type { FilterState } from "@langfuse/shared";

import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import type { FieldRegistry } from "@/src/features/search-bar/lib/fields";
import type { QueryPresetSection } from "@/src/features/search-bar/lib/completions";
import { validateQuery } from "@/src/features/search-bar/lib/validate";
import { api, type RouterOutputs } from "@/src/utils/api";

const SECTION_TITLE = "Reuse rule filters";

type ReusableFilter =
  RouterOutputs["evalsV2"]["rules"]["reusableFilters"][number];

export type ReusableRuleFilterPreset = {
  id: string;
  evaluatorCount: number;
  filterCount: number;
};

function projectRuleFilterToRegistry(
  filter: FilterState,
  registry: FieldRegistry,
): FilterState {
  return filter.map((condition) => {
    const source = RULE_FIELD_REGISTRY.resolveField(condition.column);
    if (source?.type !== "field") return condition;
    const target = registry.resolveField(source.field.id);
    return target?.type === "field"
      ? { ...condition, column: target.field.id }
      : condition;
  }) as FilterState;
}

export function prepareReusableRuleFilterPresets(
  reusableFilters: ReusableFilter[],
  registry: FieldRegistry,
): {
  sections: QueryPresetSection[];
  presets: ReusableRuleFilterPreset[];
} {
  const presets: ReusableRuleFilterPreset[] = [];
  const options = reusableFilters.flatMap((reusableFilter) => {
    const filter = projectRuleFilterToRegistry(
      reusableFilter.filter as FilterState,
      registry,
    );
    const query = filterStateToQueryText(filter, {}, registry);
    if (
      query.text.length === 0 ||
      query.skippedFilters.length > 0 ||
      !validateQuery(query.text, undefined, registry).valid
    ) {
      return [];
    }

    const id = `rule-filter:${reusableFilter.latestRuleId}`;
    presets.push({
      id,
      evaluatorCount: reusableFilter.evaluatorCount,
      filterCount: reusableFilter.filter.length,
    });
    return [
      {
        id,
        label: query.text,
        detail: `Used by ${reusableFilter.evaluatorCount} ${reusableFilter.evaluatorCount === 1 ? "evaluator" : "evaluators"}`,
        query: query.text,
      },
    ];
  });

  return {
    sections: options.length > 0 ? [{ title: SECTION_TITLE, options }] : [],
    presets,
  };
}

export function useReusableRuleFilterPresets(
  projectId: string,
  registry: FieldRegistry,
) {
  const reusableFilters = api.evalsV2.rules.reusableFilters.useQuery({
    projectId,
  });

  return useMemo(
    () =>
      prepareReusableRuleFilterPresets(reusableFilters.data ?? [], registry),
    [registry, reusableFilters.data],
  );
}
