import { useEffect } from "react";
import useLocalStorage from "@/src/components/useLocalStorage";
import { api } from "@/src/utils/api";
import {
  newTopicsBadge,
  seenTopicRuns,
  type SeenTopicRuns,
} from "./new-topics";

const NONE_SEEN: SeenTopicRuns = {};
// Maps refit nightly; the sidebar need not refetch on every navigation.
const SIDEBAR_STALE_MS = 5 * 60_000;

function useSeenTopicRuns(projectId: string) {
  return useLocalStorage<SeenTopicRuns>(
    `topics-seen-runs:v1:${projectId}`,
    NONE_SEEN,
  );
}

/** The sidebar count of new topics the viewer has not seen on the Topics page. */
export function useNewTopicsBadge(projectId: string) {
  const runs = api.topics.newTopics.useQuery(
    { projectId },
    { staleTime: SIDEBAR_STALE_MS, meta: { silentAllErrors: true } },
  );
  const [seen] = useSeenTopicRuns(projectId);
  return runs.data ? newTopicsBadge(runs.data, seen) : null;
}

/** The Topics page's new topic runs; once loaded, they count as seen. */
export function useNewTopicRuns(projectId: string) {
  const runs = api.topics.newTopics.useQuery(
    { projectId },
    { meta: { silentAllErrors: true } },
  );
  const [, setSeen] = useSeenTopicRuns(projectId);
  const data = runs.data;
  // Seen state lives in localStorage, shared with the sidebar in every tab.
  useEffect(() => {
    if (data) setSeen(seenTopicRuns(data));
  }, [data, setSeen]);
  return data;
}
