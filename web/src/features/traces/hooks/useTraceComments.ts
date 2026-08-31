import { api } from "@/src/utils/api";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { castToNumberMap } from "@/src/utils/map-utils";

export type UseTraceCommentsParams = {
  projectId: string;
  traceId: string;
};

export function useTraceComments({
  projectId,
  traceId,
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

  const traceCommentCounts = api.comments.getCountByObjectId.useQuery(
    {
      projectId,
      objectId: traceId,
      objectType: "TRACE",
    },
    {
      refetchOnMount: false,
      enabled: isAuthenticatedAndProjectMember,
    },
  );

  // Extract trace comment count from the Map response
  const traceCommentCountMap = traceCommentCounts.data
    ? castToNumberMap(traceCommentCounts.data)
    : undefined;
  const traceCount = traceCommentCountMap?.get(traceId) ?? 0;

  return {
    observationCommentCounts: observationCommentCounts.data
      ? castToNumberMap(observationCommentCounts.data)
      : new Map<string, number>(),
    traceCommentCount: traceCount,
    isLoading:
      observationCommentCounts.isLoading || traceCommentCounts.isLoading,
  };
}
