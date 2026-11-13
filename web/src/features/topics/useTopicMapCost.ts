import { useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api } from "@/src/utils/api";

/** Processing cost so far of a rule's or analysis's map; null until one is priced. */
export function useTopicMapCost({
  projectId,
  ruleId,
  analysisId,
  running,
  refreshAfter,
}: {
  projectId: string;
  ruleId?: string;
  analysisId?: string;
  /** A run is processing, so the cost is still growing. */
  running: boolean;
  /** Last run completion; a new value requests the settled cost. */
  refreshAfter: number;
}) {
  const utils = api.useUtils();
  const input = { projectId, ruleId, analysisId };
  const mapKey = getQueryKey(api.topics.mapCost, input, "query");
  const cost = useQuery({
    queryKey: [...mapKey, running ? 0 : refreshAfter],
    queryFn: ({ signal }) =>
      utils.client.topics.mapCost.query(input, { signal }),
    // Keeps the shown cost while the same map refreshes, never another map's.
    placeholderData: (previous, previousQuery) =>
      previousQuery &&
      JSON.stringify(previousQuery.queryKey.slice(0, -1)) ===
        JSON.stringify(mapKey)
        ? previous
        : undefined,
    refetchInterval: running ? 15_000 : false,
    enabled: Boolean(ruleId || analysisId),
  });
  return cost.data ?? null;
}
