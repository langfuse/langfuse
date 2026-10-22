import React, { useState, useMemo, useEffect } from "react";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { env } from "@/src/env.mjs";
import { type SlackChannel } from "@langfuse/shared/src/server";
import { useHasProjectAccess } from "@/src/features/rbac";
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

const MAX_SLACK_CHANNEL_PAGES = 20;

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
      onReauthenticate={handleReauthenticate}
    />
  );
};

const useSlackChannels = (projectId: string, enabled: boolean) => {
  const {
    data: channelsPages,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch: refetchChannels,
  } = api.slack.getChannels.useInfiniteQuery(
    { projectId },
    {
      enabled: !!projectId && enabled,
      getNextPageParam: (lastPage, allPages) =>
        allPages.length >= MAX_SLACK_CHANNEL_PAGES
          ? undefined
          : lastPage.nextCursor,
      staleTime: 5 * 60 * 1000,
    },
  );

  const channelsData = useMemo(() => {
    const pages = channelsPages?.pages ?? [];
    if (pages.length === 0) return null;

    return {
      channels: pages.flatMap((page) => page.channels),
      hasPrivateChannelAccess: pages.every(
        (page) => page.hasPrivateChannelAccess,
      ),
    };
  }, [channelsPages?.pages]);

  const isLoadingChannels =
    isLoading || isFetchingNextPage || (isFetching && !channelsData);

  // useInfiniteQuery stores page state, but next pages are only loaded when requested.
  useEffect(() => {
    if (error || !hasNextPage || isFetchingNextPage) return;

    // Query failures are classified + captured by the QueryCache seam; only
    // report non-tRPC failures of the fetch dispatch itself.
    fetchNextPage().catch((error) => reportNonTrpcError(error, "slack"));
  }, [error, fetchNextPage, hasNextPage, isFetchingNextPage]);

  return {
    channelsData,
    isLoadingChannels,
    error,
    refetchChannels,
  };
};
