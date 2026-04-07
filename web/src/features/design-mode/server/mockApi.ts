import {
  JobExecutionStatus,
  deriveEvaluatorDisplayStateFromExecutionCounts,
} from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { isDevAuthBypassEnabled } from "@/src/features/auth/lib/devAuthBypass";
import {
  designModeAnnotationQueues,
  designModeDashboards,
  designModeDashboardWidgets,
  designModeDatasets,
  designModeEvaluators,
  designModeLlmApiKeys,
  designModeLlmSchemas,
  designModeLlmTools,
  designModeProjects,
  designModePrompts,
  designModeScores,
  designModeSessions,
  designModeTraces,
  designModeUsers,
} from "../mockDb";
import { type QueryType, type ViewVersion } from "@/src/features/query";

const MOCK_NOW = new Date("2026-04-07T10:30:00.000Z");

const projectIds = new Set(designModeProjects.map((project) => project.id));
const projectById = new Map(
  designModeProjects.map((project) => [project.id, project]),
);
const userByName = new Map(designModeUsers.map((user) => [user.name, user]));

const projectTags: Record<string, string[]> = {
  test: ["support", "assistant", "production"],
  "prompt-studio": ["design", "copy", "iteration"],
  "eval-lab": ["evals", "judge", "benchmark"],
  launchpad: ["marketing", "launch", "preview"],
  "support-copilot": ["support", "triage", "ops"],
  "revenue-ops": ["revenue", "scoring", "crm"],
  "meeting-memory": ["meetings", "summary", "memory"],
  "knowledge-search": ["retrieval", "search", "preview"],
};

const queueScoreConfigs: Record<
  string,
  Array<{ id: string; name: string; dataType: "NUMERIC" | "CATEGORICAL" }>
> = {
  queue_support_qa: [
    { id: "score_cfg_helpfulness", name: "Helpfulness", dataType: "NUMERIC" },
    { id: "score_cfg_groundedness", name: "Groundedness", dataType: "NUMERIC" },
  ],
  queue_checkout_edge_cases: [
    { id: "score_cfg_tone", name: "Tone", dataType: "NUMERIC" },
    {
      id: "score_cfg_resolution",
      name: "Resolution quality",
      dataType: "NUMERIC",
    },
  ],
  queue_meeting_notes: [
    { id: "score_cfg_clarity", name: "Clarity", dataType: "NUMERIC" },
    { id: "score_cfg_recall", name: "Recall", dataType: "NUMERIC" },
  ],
};

function parseRelativeDate(label: string, fallbackMinutes: number): Date {
  if (label === "just now") {
    return new Date(MOCK_NOW.getTime() - 30_000);
  }

  const minuteMatch = label.match(/^(\d+)\s+min ago$/);
  if (minuteMatch) {
    return new Date(MOCK_NOW.getTime() - Number(minuteMatch[1]) * 60_000);
  }

  const hourMatch = label.match(/^(\d+)\s+hrs? ago$/);
  if (hourMatch) {
    return new Date(MOCK_NOW.getTime() - Number(hourMatch[1]) * 60 * 60_000);
  }

  const dayMatch = label.match(/^(\d+)\s+days? ago$/);
  if (dayMatch) {
    return new Date(
      MOCK_NOW.getTime() - Number(dayMatch[1]) * 24 * 60 * 60_000,
    );
  }

  return new Date(MOCK_NOW.getTime() - fallbackMinutes * 60_000);
}

function parseLatencySeconds(latency: string): number {
  if (latency.endsWith("ms")) {
    return Number.parseFloat(latency.replace("ms", "")) / 1000;
  }

  return Number.parseFloat(latency.replace("s", ""));
}

function parseVersion(version: string): number {
  return Number.parseInt(version.replace(/^v/i, ""), 10);
}

function avatarForUser(userId: string) {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(userId)}`;
}

function filterBySearch<T>(
  rows: T[],
  searchQuery: string | null | undefined,
  getValue: (row: T) => string,
) {
  if (!searchQuery) {
    return rows;
  }

  const query = searchQuery.toLowerCase();
  return rows.filter((row) => getValue(row).toLowerCase().includes(query));
}

function paginate<T>(rows: T[], page: number, limit: number) {
  if (limit <= 0) {
    return rows;
  }

  const start = page * limit;
  return rows.slice(start, start + limit);
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

type MockSessionBase = {
  id: string;
  projectId: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  bookmarked: boolean;
  public: boolean;
  status: string;
  environment: string;
  baseTraceCount: number;
};

const mockSessionsBase: MockSessionBase[] = designModeSessions.map(
  (session, index) => ({
    id: session.id,
    projectId: session.projectId,
    userId: userByName.get(session.user)?.id ?? session.user,
    createdAt: parseRelativeDate(session.lastSeen, 20 + index * 11),
    lastSeenAt: parseRelativeDate(session.lastSeen, 20 + index * 11),
    bookmarked: index % 2 === 0,
    public: false,
    status: session.status,
    environment:
      projectById.get(session.projectId)?.metadata.environment ?? "production",
    baseTraceCount: session.traceCount,
  }),
);

const sessionsByProject = new Map<string, MockSessionBase[]>();
for (const session of mockSessionsBase) {
  const current = sessionsByProject.get(session.projectId) ?? [];
  current.push(session);
  sessionsByProject.set(session.projectId, current);
}

const mockTraces = designModeTraces.map((trace, index) => {
  const projectSessions = sessionsByProject.get(trace.projectId) ?? [];
  const assignedSession =
    projectSessions.length > 0
      ? projectSessions[index % projectSessions.length]
      : null;
  const user = userByName.get(trace.user);
  const inputTokens = 280 + index * 37;
  const outputTokens = 96 + index * 19;
  const totalTokens = inputTokens + outputTokens;
  const inputCost = Number((inputTokens * 0.000003).toFixed(6));
  const outputCost = Number((outputTokens * 0.000012).toFixed(6));
  const totalCost = Number((inputCost + outputCost).toFixed(6));
  const timestamp = parseRelativeDate(trace.timestamp, 8 + index * 6);
  const projectName = projectById.get(trace.projectId)?.name ?? trace.projectId;

  return {
    id: trace.id,
    projectId: trace.projectId,
    sessionId: assignedSession?.id ?? null,
    userId: user?.id ?? trace.user,
    userName: trace.user,
    name: trace.name,
    model: trace.model,
    environment: trace.environment,
    timestamp,
    latencySeconds: parseLatencySeconds(trace.latency),
    score: Number.parseFloat(trace.score),
    tags: projectTags[trace.projectId] ?? ["design-mode"],
    input: JSON.stringify(
      {
        task: trace.name,
        project: projectName,
        user: trace.user,
        environment: trace.environment,
      },
      null,
      2,
    ),
    output: JSON.stringify(
      {
        summary: `${trace.name} completed successfully`,
        model: trace.model,
        confidence: trace.score,
      },
      null,
      2,
    ),
    metadata: JSON.stringify(
      {
        source: "design-mode",
        mocked: true,
        environment: trace.environment,
        projectId: trace.projectId,
        model: trace.model,
      },
      null,
      2,
    ),
    levelCounts: {
      errorCount: BigInt(index % 4 === 0 ? 1 : 0),
      warningCount: BigInt(index % 3 === 0 ? 1 : 0),
      debugCount: BigInt(2 + (index % 3)),
      defaultCount: BigInt(4 + (index % 4)),
    },
    tokenDetails: {
      input_prompt_tokens: inputTokens,
      output_completion_tokens: outputTokens,
      total: totalTokens,
    },
    costDetails: {
      input_prompt_cost: inputCost,
      output_completion_cost: outputCost,
      total: totalCost,
    },
    usage: {
      inputUsage: BigInt(inputTokens),
      outputUsage: BigInt(outputTokens),
      totalUsage: BigInt(totalTokens),
    },
    cost: {
      inputCost: new Prisma.Decimal(inputCost),
      outputCost: new Prisma.Decimal(outputCost),
    },
    totalCost: new Prisma.Decimal(totalCost),
    observationCount: BigInt(6 + (index % 5)),
    version: `v${1 + (index % 3)}`,
    release: `2026.04.${String((index % 9) + 1).padStart(2, "0")}`,
    bookmarked: index % 2 === 0,
  };
});

const traceById = new Map(mockTraces.map((trace) => [trace.id, trace]));

const mockObservations = mockTraces.flatMap((trace, index) => {
  const totalCost = trace.totalCost.toNumber();
  const totalTokens = Number(trace.usage.totalUsage);
  const baseLatencyMs = Math.round(trace.latencySeconds * 1000);

  return [
    {
      id: `obs_gen_${trace.id}`,
      projectId: trace.projectId,
      traceId: trace.id,
      traceName: trace.name,
      name: trace.name,
      userId: trace.userId,
      providedModelName: trace.model,
      type: "GENERATION",
      level: Number(trace.levelCounts.errorCount) > 0 ? "ERROR" : "DEFAULT",
      latency: baseLatencyMs,
      totalCost,
      totalTokens,
      timestamp: trace.timestamp,
      environment: trace.environment,
      release: trace.release,
      version: trace.version,
      tags: trace.tags,
    },
    {
      id: `obs_step_${trace.id}`,
      projectId: trace.projectId,
      traceId: trace.id,
      traceName: trace.name,
      name:
        index % 3 === 0
          ? "retrieval"
          : index % 3 === 1
            ? "reranker"
            : "moderation",
      userId: trace.userId,
      providedModelName: trace.model,
      type: index % 2 === 0 ? "TOOL" : "SPAN",
      level: index % 4 === 0 ? "WARNING" : "DEFAULT",
      latency: Math.max(80, Math.round(baseLatencyMs * 0.35)),
      totalCost: Number((totalCost * 0.18).toFixed(6)),
      totalTokens: Math.round(totalTokens * 0.22),
      timestamp: new Date(trace.timestamp.getTime() + 12_000),
      environment: trace.environment,
      release: trace.release,
      version: trace.version,
      tags: trace.tags,
    },
  ];
});

const dashboardById = new Map(
  designModeDashboards.map((dashboard) => [dashboard.id, dashboard]),
);

const widgetById = new Map(
  designModeDashboardWidgets.map((widget) => [widget.id, widget]),
);

function getProjectDashboards(projectId: string) {
  return designModeDashboards.filter(
    (dashboard) => dashboard.projectId === projectId,
  );
}

function getProjectDashboardWidgets(projectId: string) {
  return designModeDashboardWidgets.filter(
    (widget) => widget.projectId === projectId,
  );
}

function startOfBucket(date: Date, granularity: string): Date {
  const next = new Date(date);

  if (granularity === "minute") {
    next.setSeconds(0, 0);
    return next;
  }
  if (granularity === "hour") {
    next.setMinutes(0, 0, 0);
    return next;
  }
  if (granularity === "week") {
    const day = next.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setUTCDate(next.getUTCDate() + diff);
    next.setUTCHours(0, 0, 0, 0);
    return next;
  }
  if (granularity === "month") {
    next.setUTCDate(1);
    next.setUTCHours(0, 0, 0, 0);
    return next;
  }

  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function resolveGranularity(
  query: Pick<QueryType, "fromTimestamp" | "toTimestamp" | "timeDimension">,
) {
  const granularity = query.timeDimension?.granularity;
  if (!granularity || granularity === "day") {
    return "day";
  }
  if (granularity !== "auto") {
    return granularity;
  }

  const durationMs =
    new Date(query.toTimestamp).getTime() -
    new Date(query.fromTimestamp).getTime();

  return durationMs <= 2 * 24 * 60 * 60 * 1000 ? "hour" : "day";
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );

  return sorted[index] ?? 0;
}

function getFilterValue(row: Record<string, unknown>, column: string): unknown {
  const aliases: Record<string, string[]> = {
    model: ["providedModelName", "model"],
    startTime: ["timestamp", "startTime"],
    scoreTimestamp: ["timestamp", "scoreTimestamp"],
    scoreName: ["name", "scoreName"],
    scoreSource: ["source", "scoreSource"],
    scoreDataType: ["dataType", "scoreDataType", "data_type"],
    user: ["userId", "user"],
    tags: ["tags", "traceTags"],
  };

  const keys = aliases[column] ?? [column];
  for (const key of keys) {
    if (key in row) {
      return row[key];
    }
  }
  return undefined;
}

function matchesFilter(
  row: Record<string, unknown>,
  filter: {
    column: string;
    operator: string;
    value?: unknown;
  },
) {
  const rowValue = getFilterValue(row, filter.column);
  const filterValue = filter.value;

  switch (filter.operator) {
    case "=":
      return Array.isArray(rowValue)
        ? rowValue.includes(filterValue as never)
        : rowValue === filterValue;
    case "any of": {
      const values = Array.isArray(filterValue) ? filterValue : [filterValue];
      if (Array.isArray(rowValue)) {
        return rowValue.some((value) => values.includes(value));
      }
      return values.includes(rowValue);
    }
    case "none of": {
      const values = Array.isArray(filterValue) ? filterValue : [filterValue];
      if (Array.isArray(rowValue)) {
        return rowValue.every((value) => !values.includes(value));
      }
      return !values.includes(rowValue);
    }
    case ">":
      return rowValue instanceof Date && filterValue instanceof Date
        ? rowValue > filterValue
        : Number(rowValue ?? 0) > Number(filterValue ?? 0);
    case "<":
      return rowValue instanceof Date && filterValue instanceof Date
        ? rowValue < filterValue
        : Number(rowValue ?? 0) < Number(filterValue ?? 0);
    case "contains":
      return String(rowValue ?? "")
        .toLowerCase()
        .includes(String(filterValue ?? "").toLowerCase());
    case "is not null":
      return rowValue !== null && rowValue !== undefined && rowValue !== "";
    case "is null":
      return rowValue === null || rowValue === undefined || rowValue === "";
    default:
      return true;
  }
}

function applyFilters<T extends Record<string, unknown>>(
  rows: T[],
  filters: Array<{ column: string; operator: string; value?: unknown }>,
) {
  return rows.filter((row) =>
    filters.every((filter) => matchesFilter(row, filter)),
  );
}

const mockSessions = mockSessionsBase.map((session, index) => {
  const traces = mockTraces.filter((trace) => trace.sessionId === session.id);
  const inputTokens = traces.reduce(
    (sum, trace) => sum + Number(trace.usage.inputUsage),
    0,
  );
  const outputTokens = traces.reduce(
    (sum, trace) => sum + Number(trace.usage.outputUsage),
    0,
  );
  const totalTokens = inputTokens + outputTokens;
  const inputCost = traces.reduce(
    (sum, trace) => sum + trace.cost.inputCost.toNumber(),
    0,
  );
  const outputCost = traces.reduce(
    (sum, trace) => sum + trace.cost.outputCost.toNumber(),
    0,
  );
  const totalCost = inputCost + outputCost;

  return {
    id: session.id,
    projectId: session.projectId,
    userIds: unique(
      traces
        .map((trace) => trace.userId)
        .concat(session.userId)
        .filter(Boolean),
    ),
    countTraces: Math.max(session.baseTraceCount, traces.length || 0),
    traceTags: unique(traces.flatMap((trace) => trace.tags)),
    createdAt: session.createdAt,
    bookmarked: session.bookmarked,
    public: session.public,
    environment: traces[0]?.environment ?? session.environment,
    sessionDuration: 240 + index * 55,
    inputCost: new Prisma.Decimal(inputCost.toFixed(6)),
    outputCost: new Prisma.Decimal(outputCost.toFixed(6)),
    totalCost: new Prisma.Decimal(totalCost.toFixed(6)),
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens,
    totalObservations: traces.reduce(
      (sum, trace) => sum + Number(trace.observationCount),
      0,
    ),
  };
});

const traceScores = designModeScores.map((score, index) => {
  const trace = traceById.get(score.traceId);
  const reviewerUser = userByName.get(score.reviewer);

  return {
    id: score.id,
    projectId: score.projectId,
    traceId: score.traceId,
    sessionId: trace?.sessionId ?? null,
    observationId: `obs_${score.id}`,
    executionTraceId: null,
    timestamp: parseRelativeDate(score.updatedAt, 12 + index * 7),
    source: score.source,
    name: score.name,
    dataType: score.dataType,
    value: Number.parseFloat(score.value),
    stringValue: null,
    environment: trace?.environment ?? null,
    comment: score.comment,
    traceName: score.traceName,
    traceUserId: trace?.userId ?? null,
    traceTags: trace?.tags ?? null,
    authorUserId: reviewerUser?.id ?? null,
    authorUserImage: reviewerUser ? avatarForUser(reviewerUser.id) : null,
    authorUserName: reviewerUser?.name ?? score.reviewer,
    jobConfigurationId:
      score.reviewer === "LLM judge"
        ? (designModeEvaluators.find(
            (evaluator) =>
              evaluator.projectId === score.projectId &&
              evaluator.scoreName.toLowerCase() === score.name.toLowerCase(),
          )?.id ?? null)
        : null,
    metadata: JSON.stringify(
      {
        source: "design-mode",
        reviewer: score.reviewer,
        mocked: true,
      },
      null,
      2,
    ),
    hasMetadata: true,
  };
});

const traceScoresByProject = new Map<string, typeof traceScores>();
for (const score of traceScores) {
  const current = traceScoresByProject.get(score.projectId) ?? [];
  current.push(score);
  traceScoresByProject.set(score.projectId, current);
}

const sessionScores = mockSessions.map((session, index) => ({
  id: `session_score_${session.id}`,
  projectId: session.projectId,
  traceId: null,
  sessionId: session.id,
  observationId: null,
  executionTraceId: null,
  timestamp: new Date(session.createdAt.getTime() + 5 * 60_000),
  source: "ANNOTATION",
  name: "session_quality",
  dataType: "NUMERIC" as const,
  value: Number((0.82 + index * 0.03).toFixed(2)),
  stringValue: null,
  environment: session.environment,
  comment: "Session-level quality spot check.",
  traceName: null,
  traceUserId: null,
  traceTags: null,
  authorUserId: session.userIds[0] ?? null,
  authorUserImage: session.userIds[0]
    ? avatarForUser(session.userIds[0])
    : null,
  authorUserName:
    designModeUsers.find((user) => user.id === session.userIds[0])?.name ??
    null,
  jobConfigurationId: null,
  metadata: JSON.stringify({ source: "design-mode", scope: "session" }),
  hasMetadata: true,
}));

const allScores = [...traceScores, ...sessionScores];

const mockUsers = designModeUsers.map((user) => ({
  ...user,
  image: avatarForUser(user.id),
}));

function getProjectTraces(projectId: string) {
  return mockTraces.filter((trace) => trace.projectId === projectId);
}

function getProjectSessions(projectId: string) {
  return mockSessions.filter((session) => session.projectId === projectId);
}

function getProjectPrompts(projectId: string) {
  return designModePrompts.filter((prompt) => prompt.projectId === projectId);
}

function getProjectDatasets(projectId: string) {
  return designModeDatasets.filter(
    (dataset) => dataset.projectId === projectId,
  );
}

function getProjectAnnotationQueues(projectId: string) {
  return designModeAnnotationQueues.filter(
    (queue) => queue.projectId === projectId,
  );
}

function getProjectEvaluators(projectId: string) {
  return designModeEvaluators.filter(
    (evaluator) => evaluator.projectId === projectId,
  );
}

function getProjectScores(projectId: string) {
  return allScores.filter((score) => score.projectId === projectId);
}

function getRowsForView(
  projectId: string,
  view: QueryType["view"],
): Array<Record<string, unknown>> {
  if (view === "traces") {
    return getProjectTraces(projectId).map((trace) => ({
      ...trace,
      timestamp: trace.timestamp,
      startTime: trace.timestamp,
      traceName: trace.name,
      count: 1,
      latency: Math.round(trace.latencySeconds * 1000),
    }));
  }

  if (view === "observations") {
    return mockObservations.filter(
      (observation) => observation.projectId === projectId,
    );
  }

  if (view === "scores-numeric") {
    return getProjectScores(projectId)
      .filter(
        (score) => score.dataType === "NUMERIC" || score.dataType === "BOOLEAN",
      )
      .map((score) => ({
        ...score,
        timestamp: score.timestamp,
        startTime: score.timestamp,
        scoreTimestamp: score.timestamp,
        data_type: score.dataType,
      }));
  }

  return getProjectScores(projectId)
    .filter((score) => score.dataType === "CATEGORICAL")
    .map((score) => ({
      ...score,
      timestamp: score.timestamp,
      startTime: score.timestamp,
      scoreTimestamp: score.timestamp,
      data_type: score.dataType,
    }));
}

function getGroupDimensionValue(
  row: Record<string, unknown>,
  field: string,
  view: QueryType["view"],
) {
  const value = getFilterValue(row, field);
  if (field === "dataType" && view.startsWith("scores")) {
    return row.dataType ?? row.data_type ?? value ?? null;
  }
  return value ?? null;
}

function applyDateRange<T extends Record<string, unknown>>(
  rows: T[],
  query: Pick<QueryType, "fromTimestamp" | "toTimestamp">,
) {
  const from = new Date(query.fromTimestamp);
  const to = new Date(query.toTimestamp);
  return rows.filter((row) => {
    const timestamp = getFilterValue(row, "timestamp");
    if (!(timestamp instanceof Date)) {
      return true;
    }
    return timestamp >= from && timestamp <= to;
  });
}

function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  orderBy: QueryType["orderBy"],
) {
  if (!orderBy || orderBy.length === 0) {
    return rows;
  }

  const [{ field, direction }] = orderBy;
  return [...rows].sort((a, b) => {
    const left = a[field];
    const right = b[field];
    const leftNumber = typeof left === "number" ? left : Number(left ?? 0);
    const rightNumber = typeof right === "number" ? right : Number(right ?? 0);
    const comparison =
      Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
        ? leftNumber - rightNumber
        : String(left ?? "").localeCompare(String(right ?? ""));

    return direction === "asc" ? comparison : -comparison;
  });
}

function limitRows<T>(rows: T[], rowLimit?: number) {
  if (!rowLimit || rowLimit <= 0) {
    return rows;
  }

  return rows.slice(0, rowLimit);
}

function cloneFilterValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return [...value] as T;
  }

  return value;
}

function cloneFilters<T extends { value?: unknown }>(filters: T[]) {
  return filters.map((filter) => {
    const clonedFilter = { ...filter } as T;

    if ("value" in clonedFilter) {
      clonedFilter.value = cloneFilterValue(filter.value);
    }

    return clonedFilter;
  });
}

function cloneDashboardDefinition(
  definition: (typeof designModeDashboards)[number]["definition"],
) {
  return {
    widgets: definition.widgets.map((widget) => ({
      ...widget,
      type: "widget" as const,
    })),
  };
}

export function getMockDashboardExecuteQuery(
  projectId: string,
  query: QueryType,
  _version: ViewVersion = "v1",
) {
  const filteredRows = applyDateRange(
    applyFilters(getRowsForView(projectId, query.view), query.filters),
    query,
  );

  const grouped = new Map<string, Array<Record<string, unknown>>>();
  const granularity = resolveGranularity(query);

  for (const row of filteredRows) {
    const bucket =
      query.timeDimension !== null
        ? startOfBucket(
            getFilterValue(row, "timestamp") as Date,
            granularity,
          ).toISOString()
        : "all";
    const dimensions = query.dimensions.map((dimension) =>
      getGroupDimensionValue(row, dimension.field, query.view),
    );
    const key = JSON.stringify([bucket, ...dimensions]);
    const groupRows = grouped.get(key) ?? [];
    groupRows.push(row);
    grouped.set(key, groupRows);
  }

  const results = Array.from(grouped.entries()).map(([key, rows]) => {
    const [bucket, ...dimensionValues] = JSON.parse(key) as Array<
      string | number | null
    >;
    const result: Record<string, unknown> = {};

    query.dimensions.forEach((dimension, index) => {
      const dimensionValue = dimensionValues[index] ?? null;
      result[dimension.field] = dimensionValue;
      if (query.view.startsWith("scores") && dimension.field === "dataType") {
        result.data_type = dimensionValue;
      }
    });

    if (query.timeDimension !== null) {
      result.time_dimension = new Date(bucket);
    }

    if (query.metrics.length === 0) {
      result.count = rows.length;
      return result;
    }

    for (const metric of query.metrics) {
      const values = rows
        .map((row) => Number(getFilterValue(row, metric.measure) ?? 0))
        .filter((value) => !Number.isNaN(value));
      const alias = `${metric.aggregation}_${metric.measure}`;

      switch (metric.aggregation) {
        case "count":
          result[alias] = rows.length;
          break;
        case "uniq":
          result[alias] = new Set(
            rows.map((row) => getFilterValue(row, metric.measure)),
          ).size;
          break;
        case "sum":
          result[alias] = values.reduce((sum, value) => sum + value, 0);
          break;
        case "avg":
          result[alias] =
            values.length > 0
              ? values.reduce((sum, value) => sum + value, 0) / values.length
              : 0;
          break;
        case "p50":
          result[alias] = percentile(values, 50);
          break;
        case "p75":
          result[alias] = percentile(values, 75);
          break;
        case "p90":
          result[alias] = percentile(values, 90);
          break;
        case "p95":
          result[alias] = percentile(values, 95);
          break;
        case "p99":
          result[alias] = percentile(values, 99);
          break;
        default:
          result[alias] = 0;
      }
    }

    return result;
  });

  return limitRows(
    sortRows(results, query.orderBy),
    query.chartConfig?.row_limit,
  );
}

export function getMockDashboardChart(params: {
  projectId: string;
  queryName:
    | "score-aggregate"
    | "observations-usage-by-type-timeseries"
    | "observations-cost-by-type-timeseries"
    | null
    | undefined;
  filter?: Array<{ column: string; operator: string; value?: unknown }>;
}) {
  const filters = params.filter ?? [];

  if (params.queryName === "score-aggregate") {
    const rows = applyFilters(getProjectScores(params.projectId), filters);
    const grouped = new Map<string, typeof rows>();

    for (const row of rows) {
      const key = `${row.name}:${row.source}:${row.dataType}`;
      const groupRows = grouped.get(key) ?? [];
      groupRows.push(row);
      grouped.set(key, groupRows);
    }

    return Array.from(grouped.values())
      .map((groupRows) => ({
        scoreName: groupRows[0]?.name ?? "unknown",
        scoreSource: groupRows[0]?.source ?? "API",
        scoreDataType: groupRows[0]?.dataType ?? "NUMERIC",
        countScoreId: groupRows.length,
        avgValue:
          groupRows.length > 0
            ? groupRows.reduce((sum, row) => sum + Number(row.value ?? 0), 0) /
              groupRows.length
            : 0,
      }))
      .sort((left, right) => right.countScoreId - left.countScoreId);
  }

  const observations = applyFilters(
    mockObservations.filter(
      (observation) => observation.projectId === params.projectId,
    ),
    filters,
  );
  const grouped = new Map<string, typeof observations>();

  for (const observation of observations) {
    const bucket = startOfBucket(observation.timestamp, "day").toISOString();
    const key = JSON.stringify([bucket, observation.providedModelName]);
    const groupRows = grouped.get(key) ?? [];
    groupRows.push(observation);
    grouped.set(key, groupRows);
  }

  return Array.from(grouped.entries())
    .map(([key, groupRows]) => {
      const [bucket, model] = JSON.parse(key) as [string, string];
      const sum =
        params.queryName === "observations-usage-by-type-timeseries"
          ? groupRows.reduce((total, row) => total + row.totalTokens, 0)
          : groupRows.reduce((total, row) => total + row.totalCost, 0);

      return {
        intervalStart: new Date(bucket),
        key: model,
        sum,
      };
    })
    .sort(
      (left, right) =>
        left.intervalStart.getTime() - right.intervalStart.getTime(),
    );
}

export function getMockDashboardScoreHistogram(params: {
  projectId: string;
  filter?: Array<{ column: string; operator: string; value?: unknown }>;
}) {
  const numericScores = applyFilters(
    getProjectScores(params.projectId).filter(
      (score) => score.dataType === "NUMERIC" || score.dataType === "BOOLEAN",
    ),
    params.filter ?? [],
  );
  const values = numericScores.map((score) => Number(score.value ?? 0));

  if (values.length === 0) {
    return { chartData: [], chartLabels: ["count"] };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const bucketCount = 10;
  const span = max - min || 1;
  const bucketSize = span / bucketCount;

  const chartData = Array.from({ length: bucketCount }, (_, index) => {
    const lower = min + index * bucketSize;
    const upper = index === bucketCount - 1 ? max : lower + bucketSize;
    const count = values.filter((value) => {
      if (index === bucketCount - 1) {
        return value >= lower && value <= upper;
      }
      return value >= lower && value < upper;
    }).length;

    return {
      binLabel: `[${lower.toFixed(2)}, ${upper.toFixed(2)}]`,
      count,
    };
  });

  return { chartData, chartLabels: ["count"] };
}

export function getMockDashboards(
  projectId: string,
  input: { page: number; limit: number },
) {
  const rows = getProjectDashboards(projectId).map((dashboard) => ({
    id: dashboard.id,
    createdAt: parseRelativeDate(dashboard.createdAt, 7 * 24 * 60),
    updatedAt: parseRelativeDate(dashboard.updatedAt, 30),
    createdBy: "user_evren",
    updatedBy: "user_evren",
    projectId: dashboard.projectId,
    name: dashboard.name,
    description: dashboard.description,
    definition: cloneDashboardDefinition(dashboard.definition),
    filters: cloneFilters([...dashboard.filters]),
    owner: dashboard.owner,
  }));

  return {
    dashboards: paginate(rows, input.page, input.limit),
    totalCount: rows.length,
  } as any;
}

export function getMockDashboard(projectId: string, dashboardId: string) {
  const dashboard = dashboardById.get(dashboardId);
  if (!dashboard || dashboard.projectId !== projectId) {
    return null;
  }

  return {
    id: dashboard.id,
    createdAt: parseRelativeDate(dashboard.createdAt, 7 * 24 * 60),
    updatedAt: parseRelativeDate(dashboard.updatedAt, 30),
    createdBy: "user_evren",
    updatedBy: "user_evren",
    projectId: dashboard.projectId,
    name: dashboard.name,
    description: dashboard.description,
    definition: cloneDashboardDefinition(dashboard.definition),
    filters: cloneFilters([...dashboard.filters]),
    owner: dashboard.owner,
  } as any;
}

export function getMockDashboardWidgets(
  projectId: string,
  input: { page?: number | null; limit?: number | null },
) {
  const rows = getProjectDashboardWidgets(projectId).map((widget) => ({
    id: widget.id,
    createdAt: parseRelativeDate(widget.createdAt, 7 * 24 * 60),
    updatedAt: parseRelativeDate(widget.updatedAt, 30),
    createdBy: "user_evren",
    updatedBy: "user_evren",
    projectId: widget.projectId,
    name: widget.name,
    description: widget.description,
    view: widget.view,
    dimensions: widget.dimensions.map((dimension) => ({ ...dimension })),
    metrics: widget.metrics.map((metric) => ({ ...metric })),
    filters: cloneFilters([...widget.filters]),
    chartType: widget.chartType,
    chartConfig: { ...widget.chartConfig },
    minVersion: widget.minVersion,
    owner: widget.owner,
  }));
  const page = input.page ?? 0;
  const limit = input.limit ?? rows.length;

  return {
    widgets: paginate(rows, page, limit),
    totalCount: rows.length,
  } as any;
}

export function getMockDashboardWidget(projectId: string, widgetId: string) {
  const widget = widgetById.get(widgetId);
  if (!widget || widget.projectId !== projectId) {
    return null;
  }

  return {
    id: widget.id,
    createdAt: parseRelativeDate(widget.createdAt, 7 * 24 * 60),
    updatedAt: parseRelativeDate(widget.updatedAt, 30),
    createdBy: "user_evren",
    updatedBy: "user_evren",
    projectId: widget.projectId,
    name: widget.name,
    description: widget.description,
    view: widget.view,
    dimensions: widget.dimensions.map((dimension) => ({ ...dimension })),
    metrics: widget.metrics.map((metric) => ({ ...metric })),
    filters: cloneFilters([...widget.filters]),
    chartType: widget.chartType,
    chartConfig: { ...widget.chartConfig },
    minVersion: widget.minVersion,
    owner: widget.owner,
  } as any;
}

export function getMockScoreColumns(projectId: string) {
  const grouped = new Map<
    string,
    { key: string; name: string; source: string; dataType: string }
  >();

  for (const score of getProjectScores(projectId)) {
    const key = `${score.name}:${score.source}:${score.dataType}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        name: score.name,
        source: score.source,
        dataType: score.dataType,
      });
    }
  }

  return { scoreColumns: Array.from(grouped.values()) };
}

export function shouldUseDesignModeMock(projectId: string) {
  return isDevAuthBypassEnabled && projectIds.has(projectId);
}

export function getMockEnvironmentFilterOptions(projectId: string) {
  const project = projectById.get(projectId);
  const traceEnvironments = getProjectTraces(projectId).map(
    (trace) => trace.environment,
  );

  return unique(
    [project?.metadata.environment, ...traceEnvironments].filter(
      (environment): environment is string => Boolean(environment),
    ),
  ).map((environment) => ({ environment }));
}

export function getMockTraceHasConfigured(projectId: string) {
  return getProjectTraces(projectId).length > 0;
}

export function getMockTraces(
  projectId: string,
  input: {
    limit: number;
    page: number;
    searchQuery?: string | null;
  },
) {
  const rows = filterBySearch(
    getProjectTraces(projectId),
    input.searchQuery,
    (trace) =>
      `${trace.id} ${trace.name} ${trace.userName} ${trace.sessionId ?? ""}`,
  );

  return {
    traces: paginate(rows, input.page, input.limit).map((trace) => ({
      id: trace.id,
      bookmarked: trace.bookmarked,
      timestamp: trace.timestamp,
      name: trace.name,
      userId: trace.userId,
      sessionId: trace.sessionId ?? undefined,
      tags: trace.tags,
    })),
    totalCount: rows.length,
  };
}

export function getMockTraceMetrics(projectId: string, traceIds: string[]) {
  return getProjectTraces(projectId)
    .filter((trace) => traceIds.includes(trace.id))
    .map((trace) => ({
      id: trace.id,
      levelCounts: trace.levelCounts,
      latency: trace.latencySeconds,
      tokenDetails: trace.tokenDetails,
      totalCost: trace.totalCost,
      costDetails: trace.costDetails,
      environment: trace.environment,
      observationCount: trace.observationCount,
      usage: trace.usage,
      cost: trace.cost,
      version: trace.version,
      release: trace.release,
      scores: aggregateScores(
        traceScoresByProject
          .get(projectId)
          ?.filter((score) => score.traceId === trace.id)
          .map((score) => ({
            id: score.id,
            name: score.name,
            source: score.source as "API" | "ANNOTATION" | "EVAL",
            dataType: score.dataType,
            value: score.value,
            stringValue: score.stringValue ?? undefined,
            comment: score.comment ?? undefined,
            timestamp: score.timestamp,
            traceId: score.traceId ?? undefined,
            sessionId: score.sessionId ?? undefined,
            observationId: score.observationId ?? undefined,
            hasMetadata: score.hasMetadata,
          })) ?? [],
      ),
    }));
}

export function getMockTraceFilterOptions(projectId: string) {
  const traces = getProjectTraces(projectId);
  const scores = traceScoresByProject.get(projectId) ?? [];

  return {
    name: traces.map((trace) => ({ value: trace.name, count: 1 })),
    scores_avg: unique(scores.map((score) => score.name)),
    score_categories: [],
    tags: unique(traces.flatMap((trace) => trace.tags)).map((value) => ({
      value,
      count: traces.filter((trace) => trace.tags.includes(value)).length,
    })),
    users: unique(traces.map((trace) => trace.userId)).map((value) => ({
      value,
      count: traces.filter((trace) => trace.userId === value).length,
    })),
    sessions: unique(
      traces
        .map((trace) => trace.sessionId)
        .filter((value): value is string => Boolean(value)),
    ).map((value) => ({
      value,
      count: traces.filter((trace) => trace.sessionId === value).length,
    })),
  };
}

export function getMockTraceById(projectId: string, traceId: string) {
  const trace = getProjectTraces(projectId).find((item) => item.id === traceId);

  if (!trace) {
    return null;
  }

  return {
    id: trace.id,
    input: trace.input,
    output: trace.output,
    metadata: trace.metadata,
    timestamp: trace.timestamp,
    name: trace.name,
  };
}

export function getMockSessionHasAny(projectId: string) {
  return getProjectSessions(projectId).length > 0;
}

export function getMockSessions(
  projectId: string,
  input: {
    limit: number;
    page: number;
  },
) {
  const rows = getProjectSessions(projectId);

  return {
    sessions: paginate(rows, input.page, input.limit).map((session) => ({
      id: session.id,
      userIds: session.userIds,
      countTraces: session.countTraces,
      traceTags: session.traceTags,
      createdAt: session.createdAt,
      bookmarked: session.bookmarked,
      public: session.public,
      environment: session.environment,
    })),
    totalCount: rows.length,
  };
}

export function getMockSessionMetrics(projectId: string, sessionIds: string[]) {
  return getProjectSessions(projectId)
    .filter((session) => sessionIds.includes(session.id))
    .map((session) => ({
      id: session.id,
      userIds: session.userIds,
      countTraces: session.countTraces,
      traceTags: session.traceTags,
      createdAt: session.createdAt,
      bookmarked: session.bookmarked,
      public: session.public,
      environment: session.environment,
      trace_count: session.countTraces,
      total_observations: session.totalObservations,
      sessionDuration: session.sessionDuration,
      inputCost: session.inputCost,
      outputCost: session.outputCost,
      totalCost: session.totalCost,
      promptTokens: session.promptTokens,
      completionTokens: session.completionTokens,
      totalTokens: session.totalTokens,
      scores: aggregateScores(
        allScores
          .filter((score) => score.projectId === projectId)
          .filter(
            (score) =>
              score.sessionId === session.id ||
              mockTraces.some(
                (trace) =>
                  trace.sessionId === session.id && trace.id === score.traceId,
              ),
          )
          .map((score) => ({
            id: score.id,
            name: score.name,
            source: score.source as "API" | "ANNOTATION" | "EVAL",
            dataType: score.dataType,
            value: score.value,
            stringValue: score.stringValue ?? undefined,
            comment: score.comment ?? undefined,
            timestamp: score.timestamp,
            traceId: score.traceId ?? undefined,
            sessionId: score.sessionId ?? undefined,
            observationId: score.observationId ?? undefined,
            hasMetadata: score.hasMetadata,
          })),
      ),
    }));
}

export function getMockSessionFilterOptions(projectId: string) {
  const sessions = getProjectSessions(projectId);
  const traces = getProjectTraces(projectId);
  const scores = traceScoresByProject.get(projectId) ?? [];

  return {
    userIds: unique(sessions.flatMap((session) => session.userIds)).map(
      (value) => ({
        value,
        count: sessions.filter((session) => session.userIds.includes(value))
          .length,
      }),
    ),
    environment: [],
    tags: unique(traces.flatMap((trace) => trace.tags)).map((value) => ({
      value,
    })),
    scores_avg: unique(scores.map((score) => score.name)),
    score_categories: [],
  };
}

export function getMockUsersHasAny(projectId: string) {
  return getProjectTraces(projectId).length > 0;
}

export function getMockUsers(
  projectId: string,
  input: {
    limit: number;
    page: number;
    searchQuery?: string | null;
  },
) {
  const userIds = unique(
    getProjectTraces(projectId).map((trace) => trace.userId),
  );
  const rows = filterBySearch(
    mockUsers.filter((user) => userIds.includes(user.id)),
    input.searchQuery,
    (user) => `${user.id} ${user.name} ${user.email} ${user.team}`,
  );

  return {
    totalUsers: rows.length,
    users: paginate(rows, input.page, input.limit).map((user) => ({
      userId: user.id,
      totalTraces: BigInt(
        getProjectTraces(projectId).filter((trace) => trace.userId === user.id)
          .length,
      ),
    })),
  };
}

export function getMockUserMetrics(projectId: string, userIds: string[]) {
  return userIds.map((userId) => {
    const traces = getProjectTraces(projectId).filter(
      (trace) => trace.userId === userId,
    );
    const firstTrace = traces[traces.length - 1]?.timestamp ?? null;
    const lastTrace = traces[0]?.timestamp ?? null;
    const inputUsage = traces.reduce(
      (sum, trace) => sum + Number(trace.usage.inputUsage),
      0,
    );
    const outputUsage = traces.reduce(
      (sum, trace) => sum + Number(trace.usage.outputUsage),
      0,
    );
    const totalCost = traces.reduce(
      (sum, trace) => sum + trace.totalCost.toNumber(),
      0,
    );

    return {
      userId,
      environment: traces[0]?.environment ?? null,
      firstTrace,
      lastTrace,
      totalPromptTokens: BigInt(inputUsage),
      totalCompletionTokens: BigInt(outputUsage),
      totalTokens: BigInt(inputUsage + outputUsage),
      totalObservations: BigInt(
        traces.reduce((sum, trace) => sum + Number(trace.observationCount), 0),
      ),
      totalTraces: BigInt(traces.length),
      sumCalculatedTotalCost: totalCost,
    };
  });
}

export function getMockPromptsHasAny(projectId: string) {
  return getProjectPrompts(projectId).length > 0;
}

export function getMockPrompts(
  projectId: string,
  input: {
    limit: number;
    page: number;
    searchQuery?: string | null;
  },
) {
  const rows = filterBySearch(
    getProjectPrompts(projectId),
    input.searchQuery,
    (prompt) => `${prompt.name} ${prompt.model} ${prompt.tags.join(" ")}`,
  );

  return {
    prompts: paginate(rows, input.page, input.limit).map((prompt, index) => ({
      id: prompt.id,
      name: prompt.name,
      version: parseVersion(prompt.version),
      projectId: prompt.projectId,
      prompt: prompt.prompt,
      type: prompt.type,
      updatedAt: parseRelativeDate(prompt.updatedAt, 5 + index * 7),
      createdAt: parseRelativeDate(prompt.updatedAt, 65 + index * 13),
      labels: prompt.labels,
      tags: prompt.tags,
      row_type: "prompt" as const,
    })),
    totalCount: rows.length,
  };
}

export function getMockPromptCount(
  projectId: string,
  searchQuery?: string | null,
) {
  return {
    totalCount: BigInt(
      filterBySearch(
        getProjectPrompts(projectId),
        searchQuery,
        (prompt) => `${prompt.name} ${prompt.model} ${prompt.tags.join(" ")}`,
      ).length,
    ),
  };
}

export function getMockPromptMetrics(projectId: string, promptNames: string[]) {
  return promptNames.map((promptName) => ({
    promptName,
    observationCount:
      getProjectTraces(projectId).filter((trace) =>
        promptName.includes(trace.name.split(" ")[0]?.toLowerCase() ?? ""),
      ).length + 8,
  }));
}

export function getMockPromptFilterOptions(projectId: string) {
  const prompts = getProjectPrompts(projectId);

  return {
    name: unique(prompts.map((prompt) => prompt.name)).map((value) => ({
      value,
    })),
    labels: unique(prompts.flatMap((prompt) => prompt.labels)).map((value) => ({
      value,
    })),
    tags: unique(prompts.flatMap((prompt) => prompt.tags)).map((value) => ({
      value,
    })),
  };
}

export function getMockScores(
  projectId: string,
  input: {
    limit: number;
    page: number;
  },
) {
  const rows = allScores.filter((score) => score.projectId === projectId);

  return {
    scores: paginate(rows, input.page, input.limit),
    totalCount: rows.length,
  };
}

export function getMockScoreMetadata(projectId: string, scoreId: string) {
  return allScores.find(
    (score) => score.projectId === projectId && score.id === scoreId,
  );
}

export function getMockScoreMetricsFromEvents(
  projectId: string,
  traceIds: string[],
) {
  return getProjectTraces(projectId)
    .filter((trace) => traceIds.includes(trace.id))
    .map((trace) => ({
      traceId: trace.id,
      traceName: trace.name,
      userId: trace.userId,
      tags: trace.tags,
    }));
}

export function getMockScoreFilterOptions(projectId: string) {
  const scores = allScores.filter((score) => score.projectId === projectId);

  return {
    name: unique(scores.map((score) => score.name)).map((value) => ({
      value,
      count: scores.filter((score) => score.name === value).length,
    })),
    tags: unique(scores.flatMap((score) => score.traceTags ?? [])).map(
      (value) => ({ value }),
    ),
    traceName: unique(
      scores
        .map((score) => score.traceName)
        .filter((value): value is string => Boolean(value)),
    ).map((value) => ({
      value,
      count: scores.filter((score) => score.traceName === value).length,
    })),
    userId: unique(
      scores
        .map((score) => score.traceUserId)
        .filter((value): value is string => Boolean(value)),
    ).map((value) => ({
      value,
      count: scores.filter((score) => score.traceUserId === value).length,
    })),
    stringValue: [],
  };
}

export function getMockAnnotationQueuesHasAny(projectId: string) {
  return getProjectAnnotationQueues(projectId).length > 0;
}

export function getMockAnnotationQueues(
  projectId: string,
  input: {
    limit?: number;
    page?: number;
  },
) {
  const rows = getProjectAnnotationQueues(projectId);
  const page = input.page ?? 0;
  const limit = input.limit ?? rows.length;

  return {
    totalCount: rows.length,
    queues: paginate(rows, page, limit).map((queue, index) => ({
      id: queue.id,
      name: queue.name,
      description: queue.description,
      scoreConfigIds:
        queueScoreConfigs[queue.id]?.map((config) => config.id) ?? [],
      createdAt: parseRelativeDate(queue.updatedAt, 15 + index * 17),
      countCompletedItems: Math.max(queue.items - 5, 1),
      countPendingItems: 5,
      scoreConfigs: queueScoreConfigs[queue.id] ?? [],
      isCurrentUserAssigned: index === 0,
    })),
  };
}

export function getMockAnnotationQueueNamesAndIds(projectId: string) {
  return getProjectAnnotationQueues(projectId).map((queue) => ({
    id: queue.id,
    name: queue.name,
  }));
}

export function getMockDatasetsHasAny(projectId: string) {
  return getProjectDatasets(projectId).length > 0;
}

export function getMockDatasetMeta(projectId: string) {
  return getProjectDatasets(projectId).map((dataset) => ({
    id: dataset.id,
    name: dataset.name,
    inputSchema: dataset.inputSchema,
    expectedOutputSchema: dataset.expectedOutputSchema,
  }));
}

export function getMockDatasets(
  projectId: string,
  input: {
    limit: number;
    page: number;
    searchQuery?: string | null;
  },
) {
  const rows = filterBySearch(
    getProjectDatasets(projectId),
    input.searchQuery,
    (dataset) => `${dataset.name} ${dataset.description ?? ""}`,
  );

  return {
    datasets: paginate(rows, input.page, input.limit).map((dataset, index) => ({
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      projectId: dataset.projectId,
      createdAt: parseRelativeDate(dataset.updatedAt, 240 + index * 75),
      updatedAt: parseRelativeDate(dataset.updatedAt, 40 + index * 21),
      metadata: dataset.metadata,
      inputSchema: dataset.inputSchema,
      expectedOutputSchema: dataset.expectedOutputSchema,
      row_type: "dataset" as const,
    })),
    totalDatasets: rows.length,
  };
}

export function getMockDatasetMetrics(projectId: string, datasetIds: string[]) {
  return {
    metrics: getProjectDatasets(projectId)
      .filter((dataset) => datasetIds.includes(dataset.id))
      .map((dataset, index) => ({
        id: dataset.id,
        countDatasetItems: dataset.itemCount,
        countDatasetRuns: dataset.evalCount,
        lastRunAt: parseRelativeDate(dataset.updatedAt, 30 + index * 22),
      })),
  };
}

export function getMockEvalCounts(projectId: string) {
  const configs = getProjectEvaluators(projectId);
  return {
    configCount: configs.length,
    configActiveCount: configs.filter((config) => config.status === "ACTIVE")
      .length,
    templateCount: configs.length,
    legacyConfigCount: configs.filter(
      (config) => config.targetObject === "DATASET",
    ).length,
  };
}

export function getMockEvaluators(
  projectId: string,
  input: {
    limit: number;
    page: number;
    searchQuery?: string | null;
  },
) {
  const rows = filterBySearch(
    getProjectEvaluators(projectId),
    input.searchQuery,
    (evaluator) => `${evaluator.scoreName} ${evaluator.evalTemplate.name}`,
  );

  return {
    configs: paginate(rows, input.page, input.limit).map((evaluator) => ({
      id: evaluator.id,
      status: evaluator.status,
      blockedAt: evaluator.blockedAt,
      blockReason: evaluator.blockReason,
      blockMessage: evaluator.blockMessage,
      createdAt: parseRelativeDate(evaluator.createdAt, 300),
      updatedAt: parseRelativeDate(evaluator.updatedAt, 25),
      scoreName: evaluator.scoreName,
      targetObject: evaluator.targetObject,
      filter: evaluator.filter,
      timeScope: evaluator.timeScope,
      evalTemplate: {
        id: evaluator.evalTemplate.id,
        name: evaluator.evalTemplate.name,
        version: evaluator.evalTemplate.version,
        projectId: evaluator.evalTemplate.projectId,
      },
      displayStatus: deriveEvaluatorDisplayStateFromExecutionCounts({
        status: evaluator.status,
        blockedAt: null,
        timeScope: [],
        executionCounts: [],
      }),
    })),
    totalCount: rows.length,
  };
}

export function getMockEvaluatorById(projectId: string, id: string) {
  const evaluator = getProjectEvaluators(projectId).find(
    (item) => item.id === id,
  );

  if (!evaluator) {
    return null;
  }

  return {
    id: evaluator.id,
    projectId: evaluator.projectId,
    evalTemplateId: evaluator.evalTemplateId,
    scoreName: evaluator.scoreName,
    targetObject: evaluator.targetObject,
    filter: evaluator.filter,
    variableMapping: evaluator.variableMapping,
    sampling: new Prisma.Decimal(evaluator.sampling),
    delay: evaluator.delay,
    status: evaluator.status,
    blockedAt: evaluator.blockedAt,
    blockReason: evaluator.blockReason,
    blockMessage: evaluator.blockMessage,
    jobType: evaluator.jobType,
    createdAt: parseRelativeDate(evaluator.createdAt, 300),
    updatedAt: parseRelativeDate(evaluator.updatedAt, 25),
    timeScope: evaluator.timeScope,
    evalTemplate: {
      ...evaluator.evalTemplate,
      createdAt: parseRelativeDate(evaluator.createdAt, 320),
      updatedAt: parseRelativeDate(evaluator.updatedAt, 25),
    },
    displayStatus: deriveEvaluatorDisplayStateFromExecutionCounts({
      status: evaluator.status,
      blockedAt: null,
      timeScope: [],
      executionCounts: [],
    }),
  };
}

export function getMockEvaluatorExecutionCounts(
  projectId: string,
  evaluatorIds: string[],
) {
  return getProjectEvaluators(projectId)
    .filter((evaluator) => evaluatorIds.includes(evaluator.id))
    .reduce<
      Record<string, Array<{ status: JobExecutionStatus; count: number }>>
    >((acc, evaluator) => {
      acc[evaluator.id] = [
        {
          status: JobExecutionStatus.PENDING,
          count: evaluator.executionCounts.pending,
        },
        {
          status: JobExecutionStatus.ERROR,
          count: evaluator.executionCounts.error,
        },
        {
          status: JobExecutionStatus.COMPLETED,
          count: evaluator.executionCounts.completed,
        },
      ];
      return acc;
    }, {});
}

export function getMockEvaluatorCosts(
  projectId: string,
  evaluatorIds: string[],
) {
  return getProjectEvaluators(projectId)
    .filter((evaluator) => evaluatorIds.includes(evaluator.id))
    .reduce<Record<string, number>>((acc, evaluator) => {
      acc[evaluator.id] = evaluator.totalCost7d;
      return acc;
    }, {});
}

export function getMockLlmApiKeys(projectId: string) {
  const data = designModeLlmApiKeys.filter(
    (key) => key.projectId === projectId,
  );
  return {
    data,
    totalCount: data.length,
  };
}

export function getMockLlmTools(projectId: string) {
  return designModeLlmTools
    .filter((tool) => tool.projectId === projectId)
    .map((tool) => ({
      ...tool,
      createdAt: parseRelativeDate(tool.createdAt, 720),
      updatedAt: parseRelativeDate(tool.updatedAt, 25),
    }));
}

export function getMockLlmSchemas(projectId: string) {
  return designModeLlmSchemas
    .filter((schema) => schema.projectId === projectId)
    .map((schema) => ({
      ...schema,
      createdAt: parseRelativeDate(schema.createdAt, 720),
      updatedAt: parseRelativeDate(schema.updatedAt, 25),
    }));
}
