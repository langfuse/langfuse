import { api } from "@/src/utils/api";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { castToNumberMap } from "@/src/utils/map-utils";
import { useMemo } from "react";

export type UseTraceCommentsParams = {
  projectId: string;
  traceId: string;
  sessionId: string | undefined;
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

  const sessionTraceCommentCounts =
    api.comments.getTraceCommentCountsBySessionId.useQuery(
      { projectId, sessionId: sessionId ?? "" },
      {
        refetchOnMount: false,
        enabled: isAuthenticatedAndProjectMember && !!sessionId,
      },
    );

  // Extract trace comment count from the Map response
  const traceCommentCountMap = traceCommentCounts.data
    ? castToNumberMap(traceCommentCounts.data)
    : undefined;
  const traceCount = traceCommentCountMap?.get(traceId) ?? 0;
  const sessionCounts = useMemo(
    () =>
      castToNumberMap(sessionId ? sessionTraceCommentCounts.data : undefined) ??
      new Map<string, number>(),
    [sessionId, sessionTraceCommentCounts.data],
  );

  return {
    observationCommentCounts: observationCommentCounts.data
      ? castToNumberMap(observationCommentCounts.data)
      : new Map<string, number>(),
    traceCommentCount: traceCount,
    sessionTraceCommentCounts: sessionCounts,
    isLoading:
      observationCommentCounts.isLoading ||
      traceCommentCounts.isLoading ||
      (!!sessionId && sessionTraceCommentCounts.isLoading),
  };
}
