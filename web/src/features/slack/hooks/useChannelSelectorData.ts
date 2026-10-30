import { useState } from "react";

import { env } from "@/src/env.mjs";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useSlackChannels } from "@/src/features/slack/hooks/useSlackChannels";

/** useChannelSelectorData loads the channel list and the refresh/reauthenticate actions ChannelSelectorView needs. */
export function useChannelSelectorData(projectId: string, isEnabled = true) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Read-only roles still see the saved channel via `selectedChannel`, but
  // may not enumerate every channel the bot can see.
  const canListChannels = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });
  const canManageIntegration = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const { channelsData, isLoadingChannels, error, refetchChannels } =
    useSlackChannels(projectId, canListChannels && isEnabled);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchChannels();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleReauthenticate = () => {
    window.open(
      `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/public/slack/install?projectId=${projectId}`,
      "slack-reauth",
      "width=600,height=700",
    );
  };

  return {
    canListChannels,
    channelsData,
    isLoading: isLoadingChannels,
    hasError: !!error,
    isRefreshing,
    onRefresh: handleRefresh,
    onReauthenticate: canManageIntegration ? handleReauthenticate : undefined,
  };
}
