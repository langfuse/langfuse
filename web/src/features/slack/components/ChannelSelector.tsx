import React, { useState } from "react";
import { env } from "@/src/env.mjs";
import { type SlackChannel } from "@langfuse/shared/src/server";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useSlackChannels } from "@/src/features/slack/useSlackChannels";
import {
  ChannelSelectorView,
  type ChannelSelectorViewProps,
} from "@/src/features/slack/components/ChannelSelectorView/ChannelSelectorView";

export type { SlackChannel };

type ChannelSelectorProps = {
  /** Project ID for the Slack integration */
  projectId: string;
} & Omit<
  ChannelSelectorViewProps,
  | "channelsData"
  | "isLoading"
  | "hasError"
  | "isRefreshing"
  | "onRefresh"
  | "onReauthenticate"
>;

/**
 * ChannelSelector loads the project's Slack channels and renders them in
 * ChannelSelectorView.
 */
export const ChannelSelector: React.FC<ChannelSelectorProps> = ({
  projectId,
  ...viewProps
}) => {
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
    useSlackChannels(projectId, canListChannels);

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

  return (
    <ChannelSelectorView
      {...viewProps}
      disabled={viewProps.disabled || !canListChannels}
      channelsData={channelsData}
      isLoading={isLoadingChannels}
      hasError={!!error}
      isRefreshing={isRefreshing}
      onRefresh={handleRefresh}
      onReauthenticate={canManageIntegration ? handleReauthenticate : undefined}
    />
  );
};
