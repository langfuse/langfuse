import { useAllModels } from "@/src/features/dashboard/components/hooks";
import { type FilterState } from "@langfuse/shared";
import { type ViewVersion } from "@langfuse/shared/query";
import { useState } from "react";

export const useModelSelection = (
  projectId: string,
  globalFilterState: FilterState,
  fromTimestamp: Date,
  toTimestamp: Date,
  metricsVersion: ViewVersion,
  options?: {
    enabled?: boolean;
    queryId: string;
  },
) => {
  const { data: allModels, isPending } = useAllModels(
    projectId,
    globalFilterState,
    fromTimestamp,
    toTimestamp,
    metricsVersion,
    options,
  );

  const [selection, setSelectedModels] = useState<string[]>();
  const selectedModels =
    selection ?? allModels.slice(0, 10).map((model) => model.model);

  return {
    allModels,
    selectedModels,
    setSelectedModels,
    isPending,
  };
};
