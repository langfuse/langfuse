import { api } from "@/src/utils/api";

export function useSessionMessageTraces({
  projectId,
  sessionId,
  enabled,
}: {
  projectId: string;
  sessionId: string;
  enabled: boolean;
}) {
  return api.sessions.tracesFromEvents.useQuery(
    { projectId, sessionId },
    { enabled, staleTime: 60 * 1_000 },
  );
}
