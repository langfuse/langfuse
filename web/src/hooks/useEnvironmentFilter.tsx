import useLocalStorage from "@/src/components/useLocalStorage";
import { useEffect } from "react";
import { isEnvironmentVisibleByDefault } from "@/src/utils/environmentFilter";

interface EnvironmentVisibility {
  [key: string]: boolean; // environment name -> isVisible
}

// TODO: Add the environment selection to the query params to persist the environment filter when sharing links.
// See useDashboardDateRange for an example of this.

export function useEnvironmentFilter(
  availableEnvironments: string[] | undefined,
  projectId: string,
) {
  const [visibilityMap, setVisibilityMap] =
    useLocalStorage<EnvironmentVisibility>(
      `langfuse-environment-visibility-${projectId}`,
      {},
    );

  const visibleEnvironments = (availableEnvironments || []).filter((env) => {
    return visibilityMap[env] ?? isEnvironmentVisibleByDefault(env);
  });

  const handleSetVisibilityMap = (environments: string[]) => {
    const selectedSet = new Set(environments);

    const map = (availableEnvironments || []).reduce((acc, env) => {
      acc[env] = selectedSet.has(env);
      return acc;
    }, {} as EnvironmentVisibility);
    setVisibilityMap(map);
  };

  // Initialize or update visibility map when available environments change
  useEffect(() => {
    if (!availableEnvironments) return;

    // Create updated map with new environments
    const updatedMap = { ...visibilityMap };
    let hasChanges = false;

    availableEnvironments.forEach((env) => {
      // If environment doesn't exist in map, set default visibility
      // Environments prefixed with "langfuse-" are deselected by default
      if (updatedMap[env] === undefined) {
        updatedMap[env] = isEnvironmentVisibleByDefault(env);
        hasChanges = true;
      }
    });

    // Only update state if there were changes
    if (hasChanges) {
      setVisibilityMap(updatedMap);
    }
  }, [availableEnvironments, visibilityMap, setVisibilityMap]);

  return {
    selectedEnvironments: visibleEnvironments,
    setSelectedEnvironments: handleSetVisibilityMap,
  };
}
