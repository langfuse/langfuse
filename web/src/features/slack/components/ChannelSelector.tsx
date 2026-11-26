import React from "react";
import { type SlackChannel } from "@langfuse/shared/src/server";
import { useChannelSelectorData } from "@/src/features/slack/hooks/useChannelSelectorData";
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
  const { canListChannels, ...data } = useChannelSelectorData(projectId);

  return (
    <ChannelSelectorView
      {...viewProps}
      {...data}
      disabled={viewProps.disabled || !canListChannels}
    />
  );
};
