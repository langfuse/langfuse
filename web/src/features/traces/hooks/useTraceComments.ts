import { api } from "@/src/utils/api";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { castToNumberMap } from "@/src/utils/map-utils";
import { useMemo } from "react";
import { type TraceTarget } from "../types/traceScope";

export type UseTraceCommentsParams = {
  projectId: string;
  target: TraceTarget;
};

export function useTraceComments({
  projectId,
  target,
}: UseTraceCommentsParams) {
  const traceId = target.type === "trace" ? target.traceId : undefined;
  const sessionId = target.type === "session" ? target.sessionId : undefined;
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
      objectId: traceId ?? "",
      objectType: "TRACE",
    },
    {
      refetchOnMount: false,
      enabled: isAuthenticatedAndProjectMember && !!traceId,
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
  const traceCount = traceId ? (traceCommentCountMap?.get(traceId) ?? 0) : 0;
  const sessionCounts = useMemo(
    () =>
      castToNumberMap(sessionId ? sessionTraceCommentCounts.data : undefined) ??
      new Map<string, number>(),
    [sessionId, sessionTraceCommentCounts.data],
  );
  const observationCounts = useMemo(
    () =>
      castToNumberMap(observationCommentCounts.data) ??
      new Map<string, number>(),
    [observationCommentCounts.data],
  );

  return {
    observationCommentCounts: observationCounts,
    traceCommentCount: traceCount,
    sessionTraceCommentCounts: sessionCounts,
    isLoading:
      observationCommentCounts.isLoading ||
      traceCommentCounts.isLoading ||
      (!!sessionId && sessionTraceCommentCounts.isLoading),
  };
}
