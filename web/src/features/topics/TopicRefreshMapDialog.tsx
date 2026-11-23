import { api } from "@/src/utils/api";
import { TopicRefreshMapDialogView } from "./TopicRefreshMapDialogView";
import { type TopicRuleMap } from "./topic-maps";

/** Confirms reclustering a map now, outside the nightly refit. */
export function TopicRefreshMapDialog({
  projectId,
  rule,
  closeDialog,
}: {
  projectId: string;
  rule: TopicRuleMap;
  closeDialog: () => void;
}) {
  const utils = api.useUtils();
  const input = { projectId, ruleId: rule.id };
  const previousRefresh = api.topics.previousRuleRefreshCost.useQuery(input);
  const refresh = api.topics.refreshRuleMap.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.topics.maps.invalidate({ projectId }),
        utils.topics.ruleMapCost.invalidate(input, { refetchType: "none" }),
      ]);
      closeDialog();
    },
  });
  return (
    <TopicRefreshMapDialogView
      rule={rule}
      previousRefresh={previousRefresh.data ?? undefined}
      now={Date.now()}
      refreshing={refresh.isPending}
      onRefresh={() => refresh.mutate(input)}
    />
  );
}
