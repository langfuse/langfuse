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
  const refresh = api.topics.refreshRuleMap.useMutation({
    onSuccess: async () => {
      await utils.topics.maps.invalidate({ projectId });
      closeDialog();
    },
  });
  return (
    <TopicRefreshMapDialogView
      rule={rule}
      now={Date.now()}
      refreshing={refresh.isPending}
      onRefresh={() => refresh.mutate({ projectId, ruleId: rule.id })}
    />
  );
}
