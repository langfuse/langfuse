import { api } from "@/src/utils/api";
import { useSessionViewSelection } from "@/src/features/sessions/hooks/useSessionViewSelection";

export function useSessionScopeHeaderData({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  const viewSelection = useSessionViewSelection({
    projectId,
    sessionId,
    enabled: true,
  });
  const { filters, unmatchedTraces } = viewSelection.configuration;
  const traceFilters = filters.filter(
    (filter) => filter.column === "traceName" || unmatchedTraces === "hide",
  );
  const session = api.sessions.byIdWithScoresFromEvents.useQuery({
    projectId,
    sessionId,
  });
  const traces = api.sessions.tracesFromEvents.useQuery({
    projectId,
    sessionId,
    filter: traceFilters.length > 0 ? traceFilters : undefined,
  });
  return { session, traces, filters };
}
