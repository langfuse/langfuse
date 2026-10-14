import { preferredDecisionModel } from "@/src/evaluators/v2/fns/evaluators/preferredDecisionModel";
import { api } from "@/src/app/utils/api";

/** The decision model to show and save when the user has not chosen one yet. */
export function useFallbackDecisionModel(projectId: string, enabled: boolean) {
  const connections = api.llmApiKey.effective.useQuery(
    { projectId, includeDecisionModels: true },
    { enabled },
  );
  return preferredDecisionModel(connections.data?.data ?? []);
}
