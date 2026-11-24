import { api } from "@/src/utils/api";
import { TopicRefreshMapDialogView } from "./TopicRefreshMapDialogView";
import { type TopicRuleMap } from "./topic-maps";
import { useTopicsCapture } from "./useTopicsCapture";

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
  const capture = useTopicsCapture();
  const refresh = api.topics.refreshRuleMap.useMutation({
    onSuccess: async () => {
      const lastRefitMs = rule.lastRefitAt
        ? Date.parse(rule.lastRefitAt)
        : Number.NaN;
      capture("topics:map_refreshed", {
        filterCount: rule.filter.length,
        facetCount: rule.facetIds.length,
        samplePercent: Math.round(rule.sampling * 1000) / 10,
        minutesSinceLastRefit: Number.isFinite(lastRefitMs)
          ? Math.max(0, Math.round((Date.now() - lastRefitMs) / 60_000))
          : null,
      });
      await Promise.all([
        utils.topics.maps.invalidate({ projectId }),
        utils.topics.ruleMapCosts.invalidate(
          { projectId },
          { refetchType: "none" },
        ),
      ]);
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
