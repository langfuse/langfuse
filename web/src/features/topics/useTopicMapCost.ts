import { api } from "@/src/utils/api";

/** Processing cost so far of a rule's or analysis's map; null until one is priced. */
export function useTopicMapCost(
  projectId: string,
  map: { ruleId?: string; analysisId?: string },
) {
  const cost = api.topics.mapCost.useQuery(
    { projectId, ...map },
    {
      enabled: Boolean(map.ruleId || map.analysisId),
      staleTime: 60_000,
    },
  );
  return cost.data ?? null;
}
