import { useEffect } from "react";

import useLocalStorage from "@/src/components/useLocalStorage";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

const STORAGE_KEY = "lf-recent-projects";
const MAX_RECENT = 10;

/** Project ids most recently visited in this browser, newest first. */
export const useRecentProjects = () => {
  const [recentIds] = useLocalStorage<string[]>(STORAGE_KEY, []);
  return recentIds;
};

/** Records the project in the URL as recently visited. Mounted once in the app shell. */
export const useRecordRecentProject = () => {
  const projectId = useProjectIdFromURL();
  const [, setRecentIds] = useLocalStorage<string[]>(STORAGE_KEY, []);

  useEffect(() => {
    if (!projectId) return;
    setRecentIds((current) =>
      [projectId, ...current.filter((id) => id !== projectId)].slice(
        0,
        MAX_RECENT,
      ),
    );
  }, [projectId, setRecentIds]);
};
