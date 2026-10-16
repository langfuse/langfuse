import {
  buildTracePath,
  type AgentSessionProjection,
  type AgentProjectionSummary,
  type AgentProjectionSession,
  type FilterState,
} from "@langfuse/shared";
import { buildAgentProfilePath } from "../lib/buildAgentProfilePath";
import {
  type AgentCardMetric,
  type AgentsPrototypeOptions,
} from "../prototype-options/options";

export type OverviewScope = {
  projectId: string;
  from: Date;
  to: Date;
  filter: FilterState;
  prototypeOptions: AgentsPrototypeOptions;
};
export type OverviewAgent = AgentProjectionSummary & { skillCount: number };
export type AgentOverviewListProps = {
  scope: OverviewScope;
  agents: OverviewAgent[];
  metrics: AgentCardMetric[];
  projection: AgentSessionProjection;
  showAttention?: boolean;
};
export type AgentSort = "attention" | "sessions" | "cost" | "name";
export const METRIC_LABELS: Record<AgentCardMetric, string> = {
  sessions: "Sessions",
  tools: "Tool calls",
  skills: "Skills used",
  duration: "Avg. session time",
  cost: "Cost",
  tokens: "Tokens",
  invocations: "Invocations",
  observations: "Observations",
};
export function prepareAgents(
  projection: AgentSessionProjection,
  status: string,
  sort: AgentSort,
): OverviewAgent[] {
  const skills = new Map<string, Set<string>>();
  for (const skill of projection.skills) {
    if (skill.invocations <= 0) continue;
    const names = skills.get(skill.agentName) ?? new Set<string>();
    names.add(skill.name);
    skills.set(skill.agentName, names);
  }
  return projection.agents
    .filter((agent) => status === "all" || agent.state === status)
    .map((agent) => ({
      ...agent,
      skillCount: skills.get(agent.agentName)?.size ?? 0,
    }))
    .sort((a, b) => {
      let rank = 0;
      if (sort === "sessions") rank = b.current.sessions - a.current.sessions;
      if (sort === "cost") rank = b.current.cost - a.current.cost;
      if (sort === "attention")
        rank =
          b.signals.length - a.signals.length ||
          b.current.sessions - a.current.sessions;
      return rank || a.agentName.localeCompare(b.agentName);
    });
}
export function metricValue(
  agent: OverviewAgent,
  metric: AgentCardMetric,
): number | null {
  switch (metric) {
    case "skills":
      return agent.skillCount;
    case "tools":
      return agent.current.toolInvocations;
    case "duration":
      return agent.current.averageSessionDurationMs;
    case "invocations":
      return agent.current.invocations;
    case "observations":
      return agent.current.observations;
    case "sessions":
      return agent.current.sessions;
    case "cost":
      return agent.current.cost;
    case "tokens":
      return agent.current.tokens;
  }
}
export function formatMetric(
  metric: AgentCardMetric,
  value: number | null,
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (metric === "cost")
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value > 1 ? 2 : 4,
    }).format(value);
  if (metric === "duration") return formatDuration(value);
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}
export function agentPath(
  scope: OverviewScope,
  name: string,
  params: Record<string, string> = {},
): string {
  const url = new URL(
    buildAgentProfilePath({ ...scope, agentName: name }),
    "http://local",
  );
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}
export function sessionPath(
  scope: OverviewScope,
  row: AgentProjectionSession,
): string {
  if (row.kind === "session" && row.sessionId)
    return agentPath(scope, row.agentName, {
      tab: "sessions",
      peek: row.sessionId,
    });
  return row.traceId
    ? buildTracePath({
        projectId: scope.projectId,
        traceId: row.traceId,
        timestamp: row.firstSeen,
      })
    : agentPath(scope, row.agentName, { tab: "sessions" });
}
export function coverageIncomplete(
  projection: AgentSessionProjection,
): boolean {
  const c = projection.coverage;
  return (
    c.agentsTruncated ||
    c.rowsTruncated ||
    c.sessionsTruncated ||
    c.groupsTruncated
  );
}
export type ActivityBucket = {
  from: Date;
  to: Date;
  count: number | null;
  tools: number | null;
};
export function activityBuckets(
  projection: AgentSessionProjection,
  agentName: string,
  maxBuckets = 48,
): ActivityBucket[] {
  const from = projection.window.from.getTime(),
    to = projection.window.to.getTime();
  const step = Math.max(
    projection.activityBucketMs,
    Math.ceil(
      (to - from) / Math.max(1, maxBuckets) / projection.activityBucketMs,
    ) * projection.activityBucketMs,
  );
  if (!(step > 0) || !(to > from)) return [];
  const uncertain =
    projection.coverage.rowsTruncated || projection.coverage.groupsTruncated;
  const buckets: ActivityBucket[] = Array.from(
    { length: Math.ceil((to - from) / step) },
    (_, i) => ({
      from: new Date(from + i * step),
      to: new Date(Math.min(to, from + (i + 1) * step)),
      count: uncertain ? null : 0,
      tools: uncertain ? null : 0,
    }),
  );
  for (const row of projection.activity) {
    if (row.agentName !== agentName) continue;
    const i = Math.floor((row.timestamp.getTime() - from) / step);
    if (i < 0 || i >= buckets.length) continue;
    buckets[i].count = (buckets[i].count ?? 0) + row.invocations;
    buckets[i].tools = (buckets[i].tools ?? 0) + row.toolInvocations;
  }
  return buckets;
}
export type SessionBar = {
  session: AgentProjectionSession;
  start: number;
  width: number;
  track: number;
};
export function prepareSessionBars(
  rows: AgentProjectionSession[],
  from: Date,
  to: Date,
): { bars: SessionBar[]; tracks: number } {
  const start = from.getTime(),
    end = to.getTime(),
    span = end - start;
  if (!(span > 0)) return { bars: [], tracks: 1 };
  const ends: number[] = [],
    bars: SessionBar[] = [];
  for (const session of rows
    .filter((row) => row.inWindow)
    .sort(
      (a, b) =>
        a.firstSeen.getTime() - b.firstSeen.getTime() ||
        a.id.localeCompare(b.id),
    )) {
    const left = Math.max(start, session.firstSeen.getTime()),
      right = Math.min(end, session.lastSeen.getTime());
    if (left >= end || right < start || right < left) continue;
    let track = ends.findIndex((lastEnd) => lastEnd < left);
    if (track < 0) track = ends.length;
    ends[track] = Math.max(right, left + span * 0.006);
    bars.push({
      session,
      start: (left - start) / span,
      width: Math.min(
        1 - (left - start) / span,
        Math.max(0.006, (right - left) / span),
      ),
      track,
    });
  }
  return { bars, tracks: Math.max(1, ends.length) };
}
export type ComparisonPoint = {
  x: string;
  values: { baseline: number | null; recent: number | null };
};
/** Compare settled sessions in chronological order; a trailing mean keeps both cohorts on a normalized progress axis. */
export function comparisonSeries(
  projection: AgentSessionProjection,
  agentName: string,
): ComparisonPoint[] {
  const cohort = (period: "baseline" | "recent") =>
    projection.sessions
      .filter(
        (row) =>
          row.agentName === agentName &&
          row.kind === "session" &&
          row.completePerSession &&
          row.comparisonPeriod === period,
      )
      .sort((a, b) => a.firstSeen.getTime() - b.firstSeen.getTime());
  const baseline = cohort("baseline"),
    recent = cohort("recent");
  if (!baseline.length && !recent.length) return [];
  const points = Math.min(20, Math.max(baseline.length, recent.length));
  const meanAt = (rows: AgentProjectionSession[], index: number) => {
    if (!rows.length) return null;
    const through = Math.min(
      rows.length,
      Math.max(1, Math.ceil(((index + 1) * rows.length) / points)),
    );
    const sample = rows.slice(Math.max(0, through - 5), through);
    return (
      sample.reduce((sum, row) => sum + row.toolInvocations, 0) / sample.length
    );
  };
  return Array.from({ length: points }, (_, i) => ({
    x: `${Math.round(((i + 1) / points) * 100)}%`,
    values: { baseline: meanAt(baseline, i), recent: meanAt(recent, i) },
  }));
}
