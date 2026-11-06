import {
  AGENT_LIMITS,
  type AgentEnvironmentFilter,
  type AgentIdentity,
  type AgentScope,
} from "@langfuse/shared/agents";
import { encodeFiltersGeneric } from "@langfuse/shared";
import { decodeAndNormalizeFilters } from "@/src/features/filters/hooks/useSidebarFilterState";
import { TIME_RANGES, type TimeRange } from "@/src/utils/date-range-utils";
import { agentEnvironmentFilterConfig } from "../config/agentFilters";

const DAY_MS = 86_400_000;

export function agentWindow(value: TimeRange | undefined, now: number) {
  const fallback = { from: new Date(now - 7 * DAY_MS), to: new Date(now) };
  if (value === undefined) return { window: fallback, error: null };
  const minutes =
    "range" in value
      ? TIME_RANGES[value.range as keyof typeof TIME_RANGES]?.minutes
      : undefined;
  const from =
    "from" in value ? value.from : new Date(now - (minutes ?? NaN) * 60_000);
  const to = "to" in value ? value.to : new Date(now);
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

export function agentEnvironmentFilters(
  value: string | string[] | undefined,
): AgentEnvironmentFilter[] {
  if (typeof value !== "string") return [];
  return decodeAndNormalizeFilters(
    value,
    agentEnvironmentFilterConfig.columnDefinitions,
  ).filter(
    (filter): filter is AgentEnvironmentFilter =>
      filter.column === "environment" &&
      (filter.type === "string" || filter.type === "stringOptions"),
  );
}

export function agentScopeQuery(scope: AgentScope) {
  const query = new URLSearchParams({
    dateRange: `${scope.from.getTime()}-${scope.to.getTime()}`,
  });
  const environmentFilter: AgentEnvironmentFilter[] = [
    ...(scope.environmentFilter ?? []),
    ...(scope.environment === null
      ? []
      : [
          {
            column: "environment" as const,
            type: "stringOptions" as const,
            operator: "any of" as const,
            value: [scope.environment],
          },
        ]),
  ];
  if (environmentFilter.length)
    query.set("filter", encodeFiltersGeneric(environmentFilter));
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
  const environmentFilter = agentEnvironmentFilters(query.filter);
  if (environmentFilter.length)
    next.filter = encodeFiltersGeneric(environmentFilter);
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
