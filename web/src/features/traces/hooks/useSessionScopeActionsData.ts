import { api } from "@/src/utils/api";

export function useSessionScopeActionsData({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  return api.sessions.byIdWithScoresFromEvents.useQuery({
    projectId,
    sessionId,
  });
}
