import { api } from "@/src/utils/api";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { castToNumberMap } from "@/src/utils/map-utils";

export type UseTraceCommentsParams = {
  projectId: string;
  traceId: string;
  sessionId?: string;
};

export function useTraceComments({
  projectId,
  traceId,
  sessionId,
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
      enabled: isAuthenticatedAndProjectMember && !sessionId,
    },
  );

  const sessionTraceCommentCountsQuery =
    api.comments.getTraceCommentCountsBySessionId.useQuery(
      {
        projectId,
        sessionId: sessionId ?? "",
      },
      {
        refetchOnMount: false,
        enabled: isAuthenticatedAndProjectMember && !!sessionId,
      },
    );

  // Extract trace comment count from the Map response
  const traceCommentCountMap = sessionId
    ? sessionTraceCommentCountsQuery.data
      ? castToNumberMap(sessionTraceCommentCountsQuery.data)
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
      sessionTraceCommentCountsQuery.isLoading,
  };
}
