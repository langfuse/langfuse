import { api } from "@/src/utils/api";

export function useTraceHeaderWorkflowData({
  projectId,
  sessionId,
  objectId,
  objectType,
  isMember,
}: {
  projectId: string;
  sessionId: string | null;
  objectId: string;
  objectType: "SESSION" | "TRACE";
  isMember: boolean;
}) {
  const session = api.sessions.byIdWithScoresFromEvents.useQuery(
    { projectId, sessionId: sessionId ?? "" },
    { enabled: !!sessionId && isMember },
  );
  const counts = api.comments.getCountByObjectId.useQuery(
    { projectId, objectId, objectType },
    { enabled: isMember, refetchOnMount: false },
  );
  return { session, counts };
}
