import { api } from "@/src/utils/api";

export function useSessionScopeActionsData({
  projectId,
  sessionId,
  enabled,
}: {
  projectId: string;
  sessionId: string;
  enabled: boolean;
}) {
  return api.sessions.byIdWithScoresFromEvents.useQuery(
    { projectId, sessionId },
    { enabled },
  );
}
