import { api } from "@/src/utils/api";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { castToNumberMap } from "@/src/utils/map-utils";

export type UseTraceCommentsParams = {
  projectId: string;
  traceId: string;
  includeAllTraceCommentCounts?: boolean;
};

export function useTraceComments({
  projectId,
  traceId,
  includeAllTraceCommentCounts,
}: UseTraceCommentsParams) {
  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);

  const observationCommentCounts = api.comments.getCountByObjectType.useQuery(
    {
      projectId,
      objectType: "OBSERVATION",
    },
    {
      refetchOnMount: false,
      enabled: isAuthenticatedAndProjectMember,
    },
  );

  const traceCommentCountQuery = api.comments.getCountByObjectId.useQuery(
    {
      projectId,
      objectId: traceId,
      objectType: "TRACE",
    },
    {
      refetchOnMount: false,
      enabled: isAuthenticatedAndProjectMember && !includeAllTraceCommentCounts,
    },
  );

  const allTraceCommentCountsQuery = api.comments.getCountByObjectType.useQuery(
    {
      projectId,
      objectType: "TRACE",
    },
    {
      refetchOnMount: false,
      enabled: isAuthenticatedAndProjectMember && includeAllTraceCommentCounts,
    },
  );

  // Extract trace comment count from the Map response
  const traceCommentCountMap = includeAllTraceCommentCounts
    ? allTraceCommentCountsQuery.data
      ? castToNumberMap(allTraceCommentCountsQuery.data)
      : undefined
    : traceCommentCountQuery.data
      ? castToNumberMap(traceCommentCountQuery.data)
      : undefined;
  const traceCount = traceCommentCountMap?.get(traceId) ?? 0;

  return {
    observationCommentCounts: observationCommentCounts.data
      ? castToNumberMap(observationCommentCounts.data)
      : new Map<string, number>(),
    traceCommentCount: traceCount,
    traceCommentCounts: traceCommentCountMap ?? new Map<string, number>(),
    isLoading:
      observationCommentCounts.isLoading ||
      traceCommentCountQuery.isLoading ||
      allTraceCommentCountsQuery.isLoading,
  };
}
