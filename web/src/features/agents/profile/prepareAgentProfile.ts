import {
  type AgentProjectionActivity,
  type AgentProjectionSession,
  type AgentProjectionWindow,
} from "@langfuse/shared";
import {
  prepareOutlierSeries,
  type OutlierStripBin,
} from "@/src/features/events/components/outlier-strip/lib/binning";

export type AgentProfileTab =
  | "sessions"
  | "tools"
  | "skills"
  | "runs"
  | "observations"
  | "map";

const PROFILE_METRICS = {
  sessions: { field: "sessions", title: "Sessions active over time" },
  tools: { field: "toolInvocations", title: "Executed tools over time" },
  skills: { field: "skillInvocations", title: "Observed skills over time" },
  runs: { field: "invocations", title: "Agent invocations over time" },
  observations: { field: "observations", title: "Observations over time" },
  map: { field: "invocations", title: "Agent invocations over time" },
} as const;

export function prepareAgentProfileChart({
  activity,
  agentName,
  tab,
  window,
  bucketMs,
  widthPx,
}: {
  activity: AgentProjectionActivity[];
  agentName: string;
  tab: AgentProfileTab;
  window: AgentProjectionWindow;
  bucketMs: number;
  widthPx: number;
}) {
  const metric = PROFILE_METRICS[tab];
  const bins: OutlierStripBin[] = activity
    .filter((point) => point.agentName === agentName)
    .map((point) => ({
      bucketStart: point.timestamp,
      count: point[metric.field],
      values: { count_count: point[metric.field] },
    }));
  return {
    title: metric.title,
    ...prepareOutlierSeries({
      bins,
      metric: "count",
      fromMs: window.from.getTime(),
      toMs: window.to.getTime(),
      stepSeconds: bucketMs / 1000,
      widthPx,
    }),
  };
}

export function prepareAgentSessionRows({
  sessions,
  agentName,
  search,
  signalSessionIds,
}: {
  sessions: AgentProjectionSession[];
  agentName: string;
  search: string;
  signalSessionIds: string[] | null;
}) {
  const needle = search.toLocaleLowerCase();
  const selected = signalSessionIds ? new Set(signalSessionIds) : null;
  return sessions
    .filter(
      (session) =>
        session.agentName === agentName &&
        (selected !== null || session.inWindow) &&
        (!selected || (session.sessionId && selected.has(session.sessionId))) &&
        (!needle || session.id.toLocaleLowerCase().includes(needle)),
    )
    .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
}

export const formatAgentDuration = (milliseconds: number | null): string => {
  if (milliseconds === null) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`;
  return `${(milliseconds / 60_000).toFixed(1)} min`;
};
