import { useEffect, useMemo } from "react";

import { api, reportNonTrpcError } from "@/src/utils/api";

const MAX_SLACK_CHANNEL_PAGES = 20;

/** useSlackChannels loads every channel page the Slack bot can see for a project. */
export const useSlackChannels = (projectId: string, enabled: boolean) => {
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
