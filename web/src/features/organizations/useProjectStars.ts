import { useCallback, useMemo } from "react";

import useLocalStorage from "@/src/components/useLocalStorage";

const STORAGE_KEY = "lf-starred-projects";

/**
 * Per-user starred projects. Stored in localStorage for now; the storage is
 * the only thing a server-backed version has to replace, the shape stays.
 */
export const useProjectStars = () => {
  const [starredIds, setStarredIds] = useLocalStorage<string[]>(
    STORAGE_KEY,
    [],
  );

  const starredSet = useMemo(() => new Set(starredIds), [starredIds]);

  const toggle = useCallback(
    (projectId: string) => {
      setStarredIds((current) =>
        current.includes(projectId)
          ? current.filter((id) => id !== projectId)
          : [...current, projectId],
      );
    },
    [setStarredIds],
  );

  return {
    starredIds,
    isStarred: (projectId: string) => starredSet.has(projectId),
    toggle,
  };
};
