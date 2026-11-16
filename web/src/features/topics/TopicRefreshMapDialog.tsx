import type { TopicRule } from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { api } from "@/src/utils/api";

/** Confirms reclustering a map now, outside the nightly refit. */
export function TopicRefreshMapDialog({
  projectId,
  rule,
  closeDialog,
}: {
  projectId: string;
  rule: TopicRule;
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
    <Dialog
      title="Refresh map"
      text="Topics may be renamed, merged or split. Naming uses your clustering model as defined in topic settings."
      actions={[
        {
          label: "Refresh",
          loading: refresh.isPending,
          onClick: () => refresh.mutate({ projectId, ruleId: rule.id }),
        },
      ]}
    />
  );
}
