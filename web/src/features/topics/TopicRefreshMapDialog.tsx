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
  const history = api.topics.ruleRefreshHistory.useQuery({
    projectId,
    ruleId: rule.id,
  });
  const previousRefresh = history.data?.find(
    ({ status }) => status !== "running" && status !== "failed",
  );
  const refresh = api.topics.refreshRuleMap.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.topics.maps.invalidate({ projectId }),
        utils.topics.ruleRefreshHistory.invalidate({
          projectId,
          ruleId: rule.id,
        }),
      ]);
      closeDialog();
    },
  });
  return (
    <TopicRefreshMapDialogView
      rule={rule}
      previousRefresh={previousRefresh}
      now={Date.now()}
      refreshing={refresh.isPending}
      onRefresh={() => refresh.mutate({ projectId, ruleId: rule.id })}
    />
  );
}
