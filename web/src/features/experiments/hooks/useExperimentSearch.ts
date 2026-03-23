import { useState, useEffect } from "react";
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

  // apply search query to experiment names
  const filteredExperimentNames = experimentNames?.filter((name) =>
    name.experimentName
      .toLowerCase()
      .includes(debouncedSearchQuery.toLowerCase()),
  );

  return {
    searchQuery,
    setSearchQuery,
    searchResults: filteredExperimentNames ?? [],
    isLoading,
    availableExperimentNames: experimentNames ?? [],
  };
}
