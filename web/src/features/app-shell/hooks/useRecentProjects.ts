import { useCallback } from "react";
import useLocalStorage from "@/src/components/useLocalStorage";

const RECENT_PROJECTS_LIMIT = 10;
const NO_RECENT_PROJECTS: string[] = [];

const recentProjectsKey = (userId: string) =>
  `langfuse:recent-projects:v1:${userId}`;

/** Project ids this user opened in this browser, most recent first. */
export function useRecentProjects(userId: string) {
  const [recentProjectIds, setRecentProjectIds] = useLocalStorage<string[]>(
    recentProjectsKey(userId),
    NO_RECENT_PROJECTS,
  );

  const recordProjectVisit = useCallback(
    (projectId: string) => {
      setRecentProjectIds((current) =>
        current[0] === projectId
          ? current
          : [projectId, ...current.filter((id) => id !== projectId)].slice(
              0,
              RECENT_PROJECTS_LIMIT,
            ),
      );
    },
    [setRecentProjectIds],
  );

  return { recentProjectIds, recordProjectVisit };
}
