import {
  AGENT_LIMITS,
  type AgentIdentity,
  type AgentScope,
} from "@langfuse/shared/agents";

const DAY_MS = 86_400_000;

export function agentWindow(value: string | undefined, now: number) {
  const fallback = { from: new Date(now - 7 * DAY_MS), to: new Date(now) };
  if (value === undefined) return { window: fallback, error: null };
  const match = /^(\d+)-(\d+)$/.exec(value);
  const from = new Date(Number(match?.[1]));
  const to = new Date(Number(match?.[2]));
  const duration = to.getTime() - from.getTime();
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > AGENT_LIMITS.maxWindowDays * DAY_MS
  )
    return {
      window: fallback,
      error: `Choose a valid time range of up to ${AGENT_LIMITS.maxWindowDays} days.`,
    };
  return { window: { from, to }, error: null };
}

export function agentScopeQuery(scope: AgentScope) {
  const query = new URLSearchParams({
    dateRange: `${scope.from.getTime()}-${scope.to.getTime()}`,
  });
  if (scope.environment !== null) query.set("environment", scope.environment);
  return query;
}

export function agentTabQuery(
  query: Record<string, string | string[] | undefined>,
  tab: string,
) {
  const next: Record<string, string | string[] | undefined> = { ...query, tab };
  for (const key of [
    "filter",
    "search",
    "searchType",
    "orderBy",
    "viewId",
    "page",
    "limit",
    "pageIndex",
    "pageSize",
    "peek",
    "peekView",
    "observation",
    "traceId",
    "display",
    "timestamp",
    "aggregation",
    "traceView",
    "eventsView",
    "chartMetric",
    "chartAgg",
    "chartBreakdown",
    "chartType",
  ])
    delete next[key];
  return next;
}

export function agentProfilePath(scope: AgentScope, identity: AgentIdentity) {
  const query = agentScopeQuery(scope);
  query.set("identityKind", identity.kind);
  const base = `/project/${encodeURIComponent(scope.projectId)}/agents`;
  // Dot-only segments are normalized away by URL parsers, even when encoded.
  if (identity.value === "." || identity.value === "..") {
    query.set("agentId", identity.value);
    return `${base}?${query}`;
  }
  return `${base}/${encodeURIComponent(identity.value)}?${query}`;
}

export function agentPage(value: string | string[] | undefined) {
  const parsed = typeof value === "string" ? Number(value) : 1;
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed - 1, AGENT_LIMITS.maxPage)
    : 0;
}

export function agentNumber(value: number | null) {
  return value === null ? "Unknown" : value.toLocaleString();
}

export function agentCost(value: number | null) {
  return value === null
    ? "Unknown"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }).format(value);
}

export function agentDuration(value: number | null) {
  if (value === null) return "Unknown";
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(2)} s`;
}
