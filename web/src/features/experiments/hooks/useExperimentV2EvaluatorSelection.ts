import { observationVariableMappingList } from "@langfuse/shared";
import { useMemo, useState } from "react";

import type { RuleEvaluatorOption } from "@/src/features/evals/v2/types/rules";
import { useDebounce } from "@/src/hooks/useDebounce";
import { api } from "@/src/utils/api";

export function useExperimentV2EvaluatorSelection({
  projectId,
  enabled,
}: {
  projectId: string;
  enabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(setSearchQuery, 300, false);
  const evaluatorOptions = api.evalsV2.options.useQuery(
    {
      projectId,
      limit: 100,
      search: searchQuery.trim() || undefined,
    },
    { enabled },
  );
  const options = useMemo<RuleEvaluatorOption[]>(
    () =>
      (evaluatorOptions.data ?? []).map((evaluator) => ({
        id: evaluator.id,
        name: evaluator.name,
        type: evaluator.type,
        defaultVariableMapping: observationVariableMappingList
          .catch([])
          .parse(evaluator.latestVersion?.variableMapping),
      })),
    [evaluatorOptions.data],
  );
  return {
    options,
    isPending: enabled && evaluatorOptions.isPending,
    search,
    onSearchChange: (value: string) => {
      setSearch(value);
      debouncedSearch(value);
    },
  };
}
