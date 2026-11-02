import { useState, useEffect, useMemo } from "react";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";

interface UseExperimentSearchProps {
  projectId: string;
}

export function useExperimentSearch({ projectId }: UseExperimentSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { experimentNames, isLoading } = useExperimentNames({ projectId });

  // Match the run name or its dataset, so typing a dataset name scopes the list
  // the way the dataset filter does on the experiments table.
  const filteredExperimentNames = useMemo(() => {
    const needle = debouncedSearchQuery.trim().toLowerCase();
    if (!needle) return experimentNames;

    return experimentNames.filter(
      (experiment) =>
        experiment.experimentName.toLowerCase().includes(needle) ||
        experiment.datasetName?.toLowerCase().includes(needle),
    );
  }, [experimentNames, debouncedSearchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    searchResults: filteredExperimentNames,
    isSearchActive: debouncedSearchQuery.trim().length > 0,
    isLoading,
    availableExperimentNames: experimentNames,
  };
}
