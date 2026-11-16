import { useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api, type RouterOutputs } from "@/src/utils/api";
import { topicRuleSetupProgress } from "./topic-setup-flow";

type RuleSetupStatus = RouterOutputs["topics"]["ruleSetupStatus"];

const setupActive = (status: RuleSetupStatus | undefined) =>
  Boolean(status && topicRuleSetupProgress(status).active);

/** Polls a rule's setup while it runs; the poll that sees it finish refetches the maps and results. */
export function useTopicRuleSetupStatus({
  projectId,
  ruleId,
}: {
  projectId: string;
  ruleId: string | undefined;
}) {
  const utils = api.useUtils();
  const input = { projectId, ruleId: ruleId ?? "" };
  return useQuery({
    queryKey: getQueryKey(api.topics.ruleSetupStatus, input, "query"),
    queryFn: async ({ signal }) => {
      const wasActive = setupActive(
        utils.topics.ruleSetupStatus.getData(input),
      );
      const status = await utils.client.topics.ruleSetupStatus.query(input, {
        signal,
      });
      // The finished setup's map would otherwise only show on the next maps poll.
      if (wasActive && !setupActive(status)) {
        utils.topics.maps.invalidate({ projectId });
        utils.topics.currentResults.invalidate({ projectId });
      }
      return status;
    },
    enabled: ruleId !== undefined,
    refetchInterval: (query) => (setupActive(query.state.data) ? 5000 : false),
  });
}
