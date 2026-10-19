import type { ObservationType } from "../../domain";
import { InvalidRequestError } from "../../errors";
import {
  AGENT_NAME_METADATA_KEY,
  AGENT_PROJECTION_LIMITS as limits,
  AGENT_PROJECTION_METADATA_KEYS as metadataKeys,
  MAX_AGENT_NAME_LENGTH,
  SKILL_TOOL_NAMES,
} from "../../features/agents/constants";
import type {
  AgentProjectionActivity,
  AgentProjectionRelationship,
  AgentProjectionSession,
  AgentProjectionSkill,
  AgentProjectionSignal,
  AgentProjectionStats,
  AgentProjectionSummary,
  AgentProjectionTool,
  AgentSessionProjection,
} from "../../features/agents/types";
import type { FilterState } from "../../types";
import {
  bindUtcDateTimeParam,
  FilterList,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { EventsQueryBuilder } from "../queries/clickhouse-sql/event-query-builder";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { eventsTableNativeUiColumnDefinitions } from "../tableMappings/mapEventsTable";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";

type Scope = {
  projectId: string;
  from: Date;
  to: Date;
  agentNames?: string[];
  baselineDays?: 7 | 14;
  filter?: FilterState | null;
};

type RawEvent = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  session_id: string | null;
  agent_name: string;
  environment: string;
  type: ObservationType;
  name: string;
  start_time: string;
  end_time: string | null;
  event_ts: string;
  is_deleted: number;
  cost: string | number | null;
  tokens: string | number | null;
  input: string;
  skill_name: string;
  available_tools: string[];
  native_loaded_names?: string[];
  native_available_names?: string[];
  declared_tools: string;
  available_skills: string;
  task: string;
  area: string;
  topic: string;
  parent_session_id: string;
  parent_agent_name: string;
};

type Event = RawEvent & {
  start: number;
  end: number | null;
  version: number;
  observedSkills?: string[];
};
const DAY = 86_400_000;
const HOUR = 3_600_000;
const validName = (name: string) =>
  name.trim().length > 0 && Array.from(name).length <= MAX_AGENT_NAME_LENGTH;
const metadata = (key: string) =>
  `e.metadata_values[indexOf(e.metadata_names, '${key}')]`;
const environmentColumns = eventsTableNativeUiColumnDefinitions.filter(
  (column) => column.uiTableId === "environment",
);

/**
 * A bounded read adapter for the prototype DTO. Replace these reads with session
 * rollups without changing the browser's accounting or coverage contract.
 */
async function readEvents(
  scope: Scope,
  from: Date,
  sessionIds?: string[],
  traceIds: string[] = [],
): Promise<RawEvent[]> {
  const start = bindUtcDateTimeParam("projectionFrom", from);
  const end = bindUtcDateTimeParam("projectionTo", scope.to);
  const builder = new EventsQueryBuilder({ projectId: scope.projectId })
    .selectRaw(
      "e.trace_id AS trace_id",
      "e.span_id AS span_id",
      "e.parent_span_id AS parent_span_id",
      "e.session_id AS session_id",
      "e.environment AS environment",
      "e.type AS type",
      "e.name AS name",
      `${metadata(AGENT_NAME_METADATA_KEY)} AS agent_name`,
      "e.start_time AS start_time",
      "e.end_time AS end_time",
      "e.event_ts AS event_ts",
      "e.is_deleted AS is_deleted",
      "e.total_cost AS cost",
      "e.usage_details['total'] AS tokens",
      "e.input AS input",
      `${metadata("attributes.gen_ai.skill.name")} AS skill_name`,
      `arraySlice(mapKeys(e.tool_definitions), 1, ${limits.groups + 1}) AS available_tools`,
      "arrayMap(skill -> skill.skillName, e.skills_resource_loaded) AS native_loaded_names",
      "arrayMap(skill -> skill.skillName, e.skills_available) AS native_available_names",
      `${metadata(metadataKeys.availableTools)} AS declared_tools`,
      `${metadata(metadataKeys.availableSkills)} AS available_skills`,
      `${metadata(metadataKeys.task)} AS task`,
      `${metadata(metadataKeys.area)} AS area`,
      `${metadata(metadataKeys.topic)} AS topic`,
      `${metadata(metadataKeys.parentSessionId)} AS parent_session_id`,
      `${metadata(metadataKeys.parentAgentName)} AS parent_agent_name`,
    )
    .whereRaw(`e.start_time >= ${start.placeholder}`, {
      projectionFrom: start.value,
    })
    .whereRaw(`e.start_time <= ${end.placeholder}`, {
      projectionTo: end.value,
    });
  if (sessionIds !== undefined)
    builder.whereRaw(
      "(e.session_id IN ({projectionSessionIds: Array(String)}) OR e.trace_id IN ({projectionTraceIds: Array(String)}))",
      { projectionSessionIds: sessionIds, projectionTraceIds: traceIds },
    );
  builder
    .orderBy(
      "ORDER BY e.event_ts DESC, e.start_time DESC, e.trace_id ASC, e.span_id ASC",
    )
    .limitBy("e.trace_id", "e.span_id");
  const snapshot = builder.buildWithParams();
  const filter = new FilterList(
    createFilterFromFilterState(scope.filter ?? [], environmentColumns),
  ).apply();
  // Eligibility must follow latest-version selection: filtering identity, type,
  // environment or tombstones first can resurrect an older observation.
  const where = filter.query ? ` AND (${filter.query})` : "";
  let identity = "";
  if (sessionIds === undefined)
    identity = scope.agentNames
      ? " AND e.agent_name IN ({projectionAgentNames: Array(String)})"
      : " AND e.agent_name != ''";
  return queryClickhouse<RawEvent>({
    query: `SELECT * FROM (${snapshot.query}) e WHERE e.is_deleted = 0${where}${identity} ORDER BY e.event_ts DESC, e.start_time DESC, e.trace_id ASC, e.span_id ASC LIMIT {projectionLimit: Int32}`,
    params: {
      ...snapshot.params,
      ...filter.params,
      ...(scope.agentNames && sessionIds === undefined
        ? { projectionAgentNames: scope.agentNames }
        : {}),
      projectionLimit: limits.observations + 1,
    },
    preferredClickhouseService: "EventsReadOnly",
    tags: { projectId: scope.projectId },
    clickhouseConfigs: { request_timeout: 15_000 },
    clickhouseSettings: {
      max_execution_time: 10,
      max_memory_usage: "268435456",
      max_bytes_to_read: "134217728",
      max_result_bytes: "16777216",
      read_overflow_mode: "throw",
      result_overflow_mode: "throw",
      max_threads: 2,
    },
  });
}

function millis(value: string): number {
  return parseClickhouseUTCDateTimeFormat(value).getTime();
}

function latest(rows: RawEvent[]): Event[] {
  const result = new Map<string, Event>();
  for (const row of rows) {
    const key = JSON.stringify([row.trace_id, row.span_id]);
    const version = millis(row.event_ts);
    if ((result.get(key)?.version ?? -Infinity) > version) continue;
    const start = millis(row.start_time);
    const end = row.end_time ? millis(row.end_time) : null;
    if (!Number.isFinite(start)) continue;
    result.set(key, {
      ...row,
      start,
      end: end !== null && Number.isFinite(end) ? end : null,
      version,
    });
  }
  return [...result.values()].filter((row) => !row.is_deleted);
}

const numeric = (value: string | number | null) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const sum = (rows: Event[], key: "cost" | "tokens") =>
  rows.reduce((total, row) => total + numeric(row[key]), 0);
const unique = (values: (string | null)[]) =>
  [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].sort();
const inside = (row: Event, from: number, to: number) =>
  row.start >= from && row.start < to;
const lastTime = (rows: Event[]) =>
  Math.max(...rows.map((row) => row.end ?? row.start));

function labels(value: string): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed))
      return unique(
        parsed.filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        ),
      );
    if (typeof parsed === "string") return parsed ? [parsed] : [];
  } catch {
    // Incomplete JSON arrays in events_core are not capability declarations.
    if (value.startsWith("[") || value.startsWith('"')) return [];
  }
  return [value];
}

const skillToolPattern = new RegExp(
  `(^|[^a-z0-9_])(${SKILL_TOOL_NAMES.join("|")})($|[^a-z0-9_])`,
  "i",
);
function skillName(row: Event): string | null {
  if (row.type !== "TOOL" || !skillToolPattern.test(row.name)) return null;
  if (row.skill_name) return row.skill_name;
  const match = row.input?.match(
    /"(?:skill_name|skillName|name)"\s*:\s*("(?:[^"\\]|\\.)*")/,
  );
  if (match) {
    try {
      const decoded: unknown = JSON.parse(match[1]);
      if (typeof decoded === "string" && decoded.length) return decoded;
    } catch {
      /* A truncated escape has no complete name. */
    }
  }
  return row.name;
}

function observedSkillNames(row: Event): string[] {
  if (row.observedSkills) return row.observedSkills;
  if (row.native_loaded_names?.length)
    return (row.observedSkills = unique(row.native_loaded_names));
  const fallback = skillName(row);
  return (row.observedSkills = fallback ? [fallback] : []);
}

function availableSkillNames(row: Event): string[] {
  return unique([
    ...(row.native_available_names ?? []),
    ...labels(row.available_skills),
  ]);
}

function observedDuration(rows: Event[]): number {
  const ranges = rows
    .filter((row) => row.end !== null && row.end >= row.start)
    .map((row) => [row.start, row.end!] as const)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -Infinity;
  for (const [start, nextEnd] of ranges) {
    total += Math.max(0, nextEnd - Math.max(start, end));
    end = Math.max(end, nextEnd);
  }
  return total;
}

function isLegacyTraceWrapper(row: Event): boolean {
  // The canonical v3 backfill represents trace metadata as an unnamed,
  // durationless SPAN. It is context, not an unfinished observation.
  return (
    row.type === "SPAN" &&
    !row.agent_name &&
    !row.parent_span_id &&
    row.span_id === `t-${row.trace_id}`
  );
}

function stats(
  rows: Event[],
  units: AgentProjectionSession[],
): AgentProjectionStats {
  const sessionRows = rows.filter((row) => row.session_id);
  const sessionIds = unique(sessionRows.map((row) => row.session_id));
  const complete = units.filter(
    (unit) => unit.completePerSession && sessionIds.includes(unit.sessionId!),
  );
  const toolCounts = new Map(sessionIds.map((id) => [id, 0]));
  for (const row of sessionRows)
    if (row.type === "TOOL")
      toolCounts.set(
        row.session_id!,
        (toolCounts.get(row.session_id!) ?? 0) + 1,
      );
  return {
    sessions: sessionIds.length,
    invocations: rows.filter((row) => row.type === "AGENT").length,
    traces: unique(rows.map((row) => row.trace_id)).length,
    observations: rows.length,
    toolInvocations: rows.filter((row) => row.type === "TOOL").length,
    cost: sum(rows, "cost"),
    tokens: sum(rows, "tokens"),
    averageCostPerSession: sessionIds.length
      ? sum(sessionRows, "cost") / sessionIds.length
      : null,
    averageToolsPerSession: sessionIds.length
      ? sessionRows.filter((row) => row.type === "TOOL").length /
        sessionIds.length
      : null,
    averageSessionDurationMs: complete.length
      ? complete.reduce((total, row) => total + row.sessionElapsedMs, 0) /
        complete.length
      : null,
    completeSessions: complete.length,
    zeroToolSessions: [...toolCounts.values()].filter((count) => count === 0)
      .length,
  };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? sorted[
        Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))
      ]
    : 0;
}

function signals(
  baseline: AgentProjectionSession[],
  recent: AgentProjectionSession[],
  baselineStats: AgentProjectionStats,
  recentStats: AgentProjectionStats,
): AgentProjectionSignal[] {
  const result: AgentProjectionSignal[] = [];
  const before = baselineStats.averageToolsPerSession ?? 0;
  const after = recentStats.averageToolsPerSession ?? 0;
  if (
    before > 0 &&
    Math.abs(after - before) >= 2 &&
    (after > before * 2 || after < before * 0.5)
  ) {
    result.push({
      kind: "tool-change",
      message:
        "Executed tools per complete session changed by more than 2× (and at least 2 calls).",
      sessionIds: recent.map((row) => row.sessionId!).slice(0, 5),
    });
  }
  if (
    baselineStats.zeroToolSessions / baseline.length <= 0.1 &&
    recentStats.zeroToolSessions / recent.length >= 0.5
  ) {
    result.push({
      kind: "missing-tools",
      message:
        "At least half of recent complete sessions used no tools; at least 90% of baseline sessions used tools.",
      sessionIds: recent
        .filter((row) => row.toolInvocations === 0)
        .map((row) => row.sessionId!)
        .slice(0, 5),
    });
  }
  for (const [key, kind, delta, label] of [
    ["cost", "cost-outlier", 0.01, "Agent cost"],
    [
      "sessionElapsedMs",
      "runtime-outlier",
      30_000,
      "Whole-session elapsed time",
    ],
    ["observationCount", "steps-outlier", 20, "Agent observation count"],
  ] as const) {
    const values = baseline.map((row) => row[key]);
    const median = percentile(values, 0.5);
    const threshold = Math.max(3 * median, percentile(values, 0.95));
    const outliers = recent.filter(
      (row) => row[key] > threshold && row[key] - median >= delta,
    );
    if (outliers.length)
      result.push({
        kind,
        message: `${label} exceeds both 3× baseline median and baseline p95.`,
        sessionIds: outliers.map((row) => row.sessionId!).slice(0, 5),
      });
  }
  return result;
}

export async function getAgentSessionProjectionFromEventsTable(
  scope: Scope,
): Promise<AgentSessionProjection> {
  const from = scope.from.getTime();
  const to = scope.to.getTime();
  if (
    !scope.projectId ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from >= to ||
    to - from > limits.maxWindowDays * DAY ||
    (scope.agentNames &&
      (scope.agentNames.length > limits.agents ||
        scope.agentNames.some((name) => !validName(name)))) ||
    (scope.baselineDays !== undefined &&
      ![7, 14].includes(scope.baselineDays)) ||
    scope.filter?.some(
      (filter) => !["environment", "Environment"].includes(filter.column),
    )
  ) {
    throw new InvalidRequestError(
      "A project, a window up to 30 days, eligible agent names and environment-only filters are required.",
    );
  }
  const recentFrom = to - HOUR;
  const baselineFrom = recentFrom - (scope.baselineDays ?? 14) * DAY;
  const discoveryFrom = to - limits.discoveryDays * DAY;
  const raw = await readEvents(
    scope,
    new Date(Math.min(from, discoveryFrom, baselineFrom)),
  );
  let rowsTruncated = raw.length > limits.observations;
  const source = latest(raw.slice(0, limits.observations)).filter(
    (row) => row.start < to,
  );
  const discovered = new Map<string, number>();
  for (const row of source)
    if (validName(row.agent_name))
      discovered.set(
        row.agent_name,
        Math.max(discovered.get(row.agent_name) ?? 0, row.start),
      );
  const candidates = [...discovered]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
  const agentNames = scope.agentNames
    ? unique(scope.agentNames)
    : candidates.slice(0, limits.agents);
  const agentsTruncated =
    !scope.agentNames && candidates.length > limits.agents;
  const named = (row: Event) => agentNames.includes(row.agent_name);
  const sessionActivity = new Map<string, number>();
  for (const row of source.filter(named))
    if (row.session_id)
      sessionActivity.set(
        row.session_id,
        Math.max(sessionActivity.get(row.session_id) ?? -Infinity, row.start),
      );
  const sessionCandidates = [...sessionActivity]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
  const fallbackIds = unique(
    source
      .filter((row) => named(row) && !row.session_id)
      .map((row) => row.trace_id),
  );
  const sessionsTruncated =
    sessionCandidates.length + fallbackIds.length > limits.sessions;
  const sessionIds = sessionCandidates.slice(0, limits.sessions);
  const fallbackTraceIds = fallbackIds.slice(
    0,
    Math.max(0, limits.sessions - sessionIds.length),
  );
  const contextRaw =
    sessionIds.length || fallbackTraceIds.length
      ? await readEvents(scope, new Date(0), sessionIds, fallbackTraceIds)
      : [];
  rowsTruncated = rowsTruncated || contextRaw.length > limits.observations;
  // The second snapshot can include a newer version than discovery. Reduce them
  // together before attributing any metrics or relationship evidence.
  const merged = latest([
    ...raw.slice(0, limits.observations),
    ...contextRaw.slice(0, limits.observations),
  ])
    .filter((row) => row.start < to)
    .sort(
      (a, b) =>
        b.start - a.start ||
        a.trace_id.localeCompare(b.trace_id) ||
        a.span_id.localeCompare(b.span_id),
    );
  rowsTruncated = rowsTruncated || merged.length > limits.observations;
  const all = merged.slice(0, limits.observations);
  const historyComplete = !rowsTruncated && !sessionsTruncated;
  const contextBySession = new Map<string, Event[]>();
  const contextByTrace = new Map<string, Event[]>();
  for (const row of all) {
    if (row.trace_id) {
      const traceRows = contextByTrace.get(row.trace_id) ?? [];
      traceRows.push(row);
      contextByTrace.set(row.trace_id, traceRows);
    }
    if (row.session_id && sessionIds.includes(row.session_id)) {
      const rows = contextBySession.get(row.session_id) ?? [];
      rows.push(row);
      contextBySession.set(row.session_id, rows);
    }
  }
  const units: AgentProjectionSession[] = [];
  let groupsTruncated = false;
  const cappedNames = (values: string[]) => {
    const names = unique(values);
    if (names.length > limits.groups) groupsTruncated = true;
    return names.slice(0, limits.groups);
  };
  const unitRows = new Map<string, Event[]>();
  for (const agentName of agentNames) {
    const groups = new Map<string, Event[]>();
    for (const row of all.filter((row) => row.agent_name === agentName)) {
      if (row.session_id && !sessionIds.includes(row.session_id)) continue;
      if (!row.session_id && !row.trace_id) continue;
      if (!row.session_id && !fallbackTraceIds.includes(row.trace_id)) continue;
      const key = JSON.stringify([
        agentName,
        row.session_id ? "session" : "trace",
        row.session_id || row.trace_id,
      ]);
      const rows = groups.get(key) ?? [];
      rows.push(row);
      groups.set(key, rows);
    }
    for (const [id, rows] of groups) {
      const sessionId = rows[0].session_id || null;
      const context = sessionId
        ? contextBySession.get(sessionId)!
        : contextByTrace.get(rows[0].trace_id)!;
      const first = Math.min(...rows.map((row) => row.start));
      const last = lastTime(rows);
      const contextFirst = Math.min(...context.map((row) => row.start));
      const contextLast = lastTime(context);
      const open = context.some(
        (row) =>
          !isLegacyTraceWrapper(row) &&
          (row.end === null || row.end > to || row.end < row.start),
      );
      const clipped = contextLast > to - limits.settledMinutes * 60_000;
      let reason: AgentProjectionSession["completenessReason"] = "complete";
      if (!sessionId) reason = "missing-session-id";
      else if (!historyComplete) reason = "row-limit";
      else if (open) reason = "open-span";
      else if (clipped) reason = "window-clipped";
      const complete = reason === "complete";
      let comparisonPeriod: AgentProjectionSession["comparisonPeriod"] = null;
      if (complete && contextLast >= recentFrom) comparisonPeriod = "recent";
      else if (
        complete &&
        contextLast >= baselineFrom &&
        contextLast < recentFrom
      )
        comparisonPeriod = "baseline";
      const unit: AgentProjectionSession = {
        id,
        kind: sessionId ? "session" : "trace",
        agentName,
        sessionId,
        traceId: sessionId ? null : rows[0].trace_id,
        traceCount: unique(rows.map((row) => row.trace_id)).length,
        sampleTraceIds: unique(rows.map((row) => row.trace_id)).slice(0, 5),
        participatingAgentNames: unique(
          context.map((row) =>
            validName(row.agent_name) ? row.agent_name : null,
          ),
        ),
        firstSeen: new Date(first),
        lastSeen: new Date(last),
        sessionFirstSeen: new Date(contextFirst),
        sessionLastSeen: new Date(contextLast),
        agentObservedDurationMs: observedDuration(rows),
        sessionElapsedMs: Math.max(0, contextLast - contextFirst),
        invocations: rows.filter((row) => row.type === "AGENT").length,
        toolInvocations: rows.filter((row) => row.type === "TOOL").length,
        observationCount: rows.length,
        cost: sum(rows, "cost"),
        tokens: sum(rows, "tokens"),
        windowCost: sum(
          rows.filter((row) => inside(row, from, to)),
          "cost",
        ),
        windowTokens: sum(
          rows.filter((row) => inside(row, from, to)),
          "tokens",
        ),
        windowToolInvocations: rows.filter(
          (row) => row.type === "TOOL" && inside(row, from, to),
        ).length,
        windowInvocations: rows.filter(
          (row) => row.type === "AGENT" && inside(row, from, to),
        ).length,
        windowObservationCount: rows.filter((row) => inside(row, from, to))
          .length,
        toolNames: cappedNames(
          rows
            .filter((row) => row.type === "TOOL" && inside(row, from, to))
            .map((row) => row.name),
        ),
        skillNames: cappedNames(
          rows
            .filter((row) => inside(row, from, to))
            .flatMap(observedSkillNames),
        ),
        completePerSession: complete,
        completenessReason: reason,
        inWindow: rows.some((row) => inside(row, from, to)),
        comparisonPeriod,
      };
      units.push(unit);
      unitRows.set(id, rows);
    }
  }
  units.sort(
    (a, b) =>
      b.lastSeen.getTime() - a.lastSeen.getTime() || a.id.localeCompare(b.id),
  );
  const agents = agentNames.map((agentName) => {
    const history = all.filter(
      (row) => row.agent_name === agentName && inside(row, discoveryFrom, to),
    );
    const currentRows = all.filter(
      (row) => row.agent_name === agentName && inside(row, from, to),
    );
    const ownUnits = units.filter((row) => row.agentName === agentName);
    const baselineUnits = ownUnits.filter(
      (row) => row.comparisonPeriod === "baseline",
    );
    const recentUnits = ownUnits.filter(
      (row) => row.comparisonPeriod === "recent",
    );
    const baseline = stats(
      baselineUnits.flatMap((row) => unitRows.get(row.id)!),
      baselineUnits,
    );
    const recent = stats(
      recentUnits.flatMap((row) => unitRows.get(row.id)!),
      recentUnits,
    );
    let comparisonStatus: AgentProjectionSummary["comparisonStatus"] = "ready";
    if (!historyComplete) comparisonStatus = "incomplete-cohort";
    else if (
      baseline.sessions < limits.baselineSessions ||
      recent.sessions < limits.recentSessions
    )
      comparisonStatus = "insufficient-data";
    return {
      agentName,
      firstSeen: history.length
        ? new Date(Math.min(...history.map((row) => row.start)))
        : null,
      lastSeen: history.length ? new Date(lastTime(history)) : null,
      state: currentRows.length ? ("active" as const) : ("dormant" as const),
      current: stats(currentRows, ownUnits),
      baseline,
      recent,
      comparisonStatus,
      excludedSessions: ownUnits.filter(
        (row) =>
          row.sessionId &&
          !row.completePerSession &&
          row.sessionLastSeen.getTime() >= baselineFrom,
      ).length,
      signals:
        comparisonStatus === "ready"
          ? signals(baselineUnits, recentUnits, baseline, recent)
          : [],
      tasks: cappedNames(history.flatMap((row) => labels(row.task))),
      areas: cappedNames(history.flatMap((row) => labels(row.area))),
      topics: cappedNames(history.flatMap((row) => labels(row.topic))),
      availableSkillNames: cappedNames(history.flatMap(availableSkillNames)),
    };
  });

  const current = all.filter((row) => named(row) && inside(row, from, to));
  function toolGroups(skills: boolean): AgentProjectionTool[] {
    const output: AgentProjectionTool[] = [];
    for (const agentName of agentNames) {
      const rows = current.filter((row) => row.agent_name === agentName);
      const declarations = all.filter(
        (row) => row.agent_name === agentName && inside(row, discoveryFrom, to),
      );
      const available = unique(
        declarations.flatMap((row) =>
          skills
            ? availableSkillNames(row)
            : [...(row.available_tools ?? []), ...labels(row.declared_tools)],
        ),
      );
      const groups = new Map<string, Event[]>();
      for (const row of rows) {
        let names: string[] = [];
        if (skills) names = observedSkillNames(row);
        else if (row.type === "TOOL" && row.name) names = [row.name];
        for (const name of names) {
          const group = groups.get(name) ?? [];
          group.push(row);
          groups.set(name, group);
        }
      }
      for (const name of available) if (!groups.has(name)) groups.set(name, []);
      const sorted = [...groups].sort(
        (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
      );
      if (sorted.length > limits.groups) groupsTruncated = true;
      for (const [name, group] of sorted.slice(0, limits.groups))
        output.push({
          agentName,
          name,
          invocations: group.length,
          sessions: unique(group.map((row) => row.session_id)).length,
          traces: unique(group.map((row) => row.trace_id)).length,
          lastUsed: group.length
            ? new Date(Math.max(...group.map((row) => row.start)))
            : null,
          available: available.includes(name),
        });
    }
    return output;
  }
  const tools = toolGroups(false);
  const skills: AgentProjectionSkill[] = toolGroups(true).map((row) => {
    const own = current.filter(
      (event) =>
        event.agent_name === row.agentName &&
        observedSkillNames(event).includes(row.name),
    );
    const native =
      own.some((event) => event.native_loaded_names?.includes(row.name)) ||
      (own.length === 0 &&
        all.some(
          (event) =>
            event.agent_name === row.agentName &&
            event.native_available_names?.includes(row.name),
        ));
    const legacy = own.some((event) => !event.native_loaded_names?.length);
    let source: AgentProjectionSkill["source"] = "tool-name-preview";
    if (native && legacy) source = "mixed";
    else if (native) source = "native";
    return {
      ...row,
      source,
      sampleTraceIds: unique(own.map((event) => event.trace_id)).slice(0, 5),
    };
  });
  const activityBucketMs = Math.max(
    60_000,
    Math.ceil((to - from) / 48 / 60_000) * 60_000,
  );
  const bucketCount = Math.min(
    limits.activityBuckets,
    Math.ceil((to - from) / activityBucketMs),
  );
  const activity: AgentProjectionActivity[] = [];
  for (const agentName of agentNames)
    for (let bucket = 0; bucket < bucketCount; bucket++) {
      const time = from + bucket * activityBucketMs;
      const rows = current.filter(
        (row) =>
          row.agent_name === agentName &&
          inside(row, time, Math.min(to, time + activityBucketMs)),
      );
      if (!rows.length && rowsTruncated) continue;
      activity.push({
        agentName,
        timestamp: new Date(time),
        sessions: unique(rows.map((row) => row.session_id)).length,
        invocations: rows.filter((row) => row.type === "AGENT").length,
        toolInvocations: rows.filter((row) => row.type === "TOOL").length,
        observations: rows.length,
        skillInvocations: rows.reduce(
          (total, row) => total + observedSkillNames(row).length,
          0,
        ),
        cost: sum(rows, "cost"),
        tokens: sum(rows, "tokens"),
      });
    }

  const relationships: AgentProjectionRelationship[] = [];
  function addEdge(
    source: string,
    target: string,
    kind: AgentProjectionRelationship["kind"],
    evidence: string,
    provenance: AgentProjectionRelationship["provenance"],
  ) {
    if (!agentNames.includes(source) || !agentNames.includes(target)) return;
    let edge = relationships.find(
      (row) =>
        row.source === source &&
        row.target === target &&
        row.kind === kind &&
        row.provenance === provenance,
    );
    if (!edge) {
      edge = { source, target, kind, weight: 0, evidence: [], provenance };
      relationships.push(edge);
    }
    edge.weight++;
    if (edge.evidence.length < 5 && !edge.evidence.includes(evidence))
      edge.evidence.push(evidence);
  }
  const spans = new Map(
    all.map((row) => [JSON.stringify([row.trace_id, row.span_id]), row]),
  );
  const declaredLinks = new Set<string>();
  for (const row of current) {
    if (row.type === "AGENT") {
      let parent = row.parent_span_id;
      const seen = new Set<string>([row.span_id]);
      while (parent && !seen.has(parent) && seen.size <= 128) {
        seen.add(parent);
        const ancestor = spans.get(JSON.stringify([row.trace_id, parent]));
        if (!ancestor) break;
        if (ancestor.type === "AGENT" && validName(ancestor.agent_name)) {
          addEdge(
            ancestor.agent_name,
            row.agent_name,
            "calls",
            row.trace_id,
            "trace-ancestry",
          );
          break;
        }
        parent = ancestor.parent_span_id;
      }
    }
    if (
      row.session_id &&
      row.parent_session_id &&
      validName(row.parent_agent_name)
    ) {
      const key = JSON.stringify([
        row.parent_session_id,
        row.parent_agent_name,
        row.session_id,
        row.agent_name,
      ]);
      if (!declaredLinks.has(key)) {
        declaredLinks.add(key);
        addEdge(
          row.parent_agent_name,
          row.agent_name,
          "calls",
          `${row.parent_session_id} → ${row.session_id}`,
          "declared-session-link",
        );
      }
    }
  }
  for (let i = 0; i < agents.length; i++)
    for (let j = i + 1; j < agents.length; j++) {
      const left = agents[i];
      const right = agents[j];
      const leftTools = tools
        .filter(
          (row) => row.agentName === left.agentName && row.invocations > 0,
        )
        .map((row) => row.name);
      const rightTools = tools
        .filter(
          (row) => row.agentName === right.agentName && row.invocations > 0,
        )
        .map((row) => row.name);
      const shared = leftTools.filter((name) => rightTools.includes(name));
      if (
        shared.length >= 2 &&
        shared.length / unique([...leftTools, ...rightTools]).length >= 0.3
      ) {
        for (const tool of shared)
          addEdge(
            left.agentName,
            right.agentName,
            "tools",
            tool,
            "observed-tools",
          );
      }
      for (const kind of ["tasks", "areas", "topics"] as const)
        for (const label of left[kind].filter((label) =>
          right[kind].includes(label),
        ))
          addEdge(
            left.agentName,
            right.agentName,
            kind,
            label,
            "declared-label",
          );
    }
  relationships.sort(
    (a, b) =>
      b.weight - a.weight ||
      a.source.localeCompare(b.source) ||
      a.target.localeCompare(b.target),
  );
  if (relationships.length > 200) groupsTruncated = true;
  const traceCandidates = unique(current.map((row) => row.trace_id));
  const traceIds = traceCandidates.slice(0, 100);
  const mapRows = all.filter(
    (row) => traceIds.includes(row.trace_id) && inside(row, from, to),
  );
  const map = {
    rows: mapRows.map((row) => ({
      traceId: row.trace_id,
      spanId: row.span_id,
      parentSpanId: row.parent_span_id || null,
      type: row.type,
      agentName: validName(row.agent_name) ? row.agent_name : null,
      startTime: new Date(row.start),
    })),
    traceIds,
    traceCount: traceIds.length,
    traceLimit: 100,
    rowLimit: limits.observations,
    tracesTruncated: traceCandidates.length > 100,
    rowsTruncated,
    isTruncated: rowsTruncated || traceCandidates.length > 100,
    windowBounded: true as const,
  };
  return {
    window: { from: scope.from, to: scope.to },
    recentWindow: { from: new Date(recentFrom), to: scope.to },
    baselineWindow: { from: new Date(baselineFrom), to: new Date(recentFrom) },
    discoveryWindow: { from: new Date(discoveryFrom), to: scope.to },
    agents,
    sessions: units,
    tools,
    skills,
    activity,
    activityBucketMs,
    relationships: relationships.slice(0, 200),
    map,
    coverage: {
      source: "metadata-preview",
      agentLimit: limits.agents,
      sessionLimit: limits.sessions,
      rowLimit: limits.observations,
      groupsLimit: limits.groups,
      agentsTruncated,
      sessionsTruncated,
      rowsTruncated,
      groupsTruncated,
      historyComplete,
      missingSessionTraces: unique(
        current.filter((row) => !row.session_id).map((row) => row.trace_id),
      ).length,
      unlinkedObservations: current.filter(
        (row) => !row.session_id && !row.trace_id,
      ).length,
      incompleteSessions: units.filter(
        (row) => row.sessionId && !row.completePerSession,
      ).length,
      inputTruncated: true,
      settledMinutes: limits.settledMinutes,
    },
  };
}
