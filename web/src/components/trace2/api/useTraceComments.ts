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

  return {
    observationCommentCounts: observationCommentCounts.data
      ? castToNumberMap(observationCommentCounts.data)
      : new Map<string, number>(),
    traceCommentCount: traceCommentCounts.data ?? 0,
    isLoading:
      observationCommentCounts.isLoading || traceCommentCounts.isLoading,
  };
}
