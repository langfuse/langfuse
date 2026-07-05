import { env } from "@/src/env.mjs";
import type {
  DiagnosticArea,
  DiagnosticDetail,
  DiagnosticStatus,
  InstanceHealthClickHouseMetricPanel,
  InstanceHealthClickHousePanels,
  InstanceHealthFinding,
  InstanceHealthLedgerRow,
  InstanceHealthMetricSeries,
  InstanceHealthResponse,
  InstanceHealthRunbookStep,
  InstanceHealthTimeRange,
  InstanceHealthUnavailableDiagnostic,
} from "@/src/features/instance-health/types";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  CodeEvalExecutionQueue,
  convertDateToClickhouseDateTime,
  EvalExecutionQueue,
  getQueue,
  IngestionQueue,
  LLMAsJudgeExecutionQueue,
  logger,
  OtelIngestionQueue,
  queryClickhouse,
  QueueName,
  redis,
  SecondaryEvalExecutionQueue,
  SecondaryIngestionQueue,
  SecondaryOtelIngestionQueue,
  TraceUpsertQueue,
} from "@langfuse/shared/src/server";
import type { Queue } from "bullmq";

const STATUS_RANK: Record<DiagnosticStatus, number> = {
  ok: 0,
  unavailable: 1,
  warning: 2,
  error: 3,
};

const CLICKHOUSE_QUERY_SETTINGS = {
  max_execution_time: 3,
  max_result_rows: "5000",
  skip_unavailable_shards: 1,
} as const;

const CLICKHOUSE_QUERY_CONFIGS = {
  request_timeout: 5_000,
};

const RECENT_WINDOW_MINUTES = 3;
const QUEUE_BACKLOG_WARNING_THRESHOLD = 1_000;
const QUEUE_BACKLOG_ERROR_THRESHOLD = 10_000;

const MEMORY_METRICS = [
  "CGroupMemoryUsed",
  "CGroupMemoryTotal",
  "MemoryResident",
  "MemoryResidentWithoutPageCache",
  "OSMemoryTotal",
  "OSMemoryAvailable",
] as const;

const CPU_METRICS = [
  "CGroupUserTimeNormalized",
  "CGroupSystemTimeNormalized",
  "OSUserTimeNormalized",
  "OSSystemTimeNormalized",
] as const;

const CURRENT_CLICKHOUSE_METRICS = [
  ...MEMORY_METRICS,
  ...CPU_METRICS,
  "TotalBytesOfMergeTreeTables",
  "TotalRowsOfMergeTreeTables",
  "TotalPartsOfMergeTreeTables",
] as const;

const TIME_RANGE_CONFIG = {
  now: null,
  "1h": { hours: 1, bucketMinutes: 5 },
  "6h": { hours: 6, bucketMinutes: 15 },
  "24h": { hours: 24, bucketMinutes: 60 },
} as const;

type ClickHouseSystemTable =
  | "system.asynchronous_metrics"
  | "system.asynchronous_metric_log"
  | "system.disks"
  | "system.tables";

type ClickHouseMetricRow = {
  node: string;
  metric: string;
  value: string | number | null;
};

type ClickHouseDiskRow = {
  node: string;
  name: string;
  type: string;
  free_space: string | number | null;
  total_space: string | number | null;
  unreserved_space: string | number | null;
  keep_free_space: string | number | null;
};

type ClickHouseTableRow = {
  node: string;
  database: string;
  table: string;
  engine: string;
  total_rows: string | number | null;
  total_bytes: string | number | null;
  parts: string | number | null;
  active_parts: string | number | null;
};

type ClickHouseHistoryRow = {
  node: string;
  timestamp_ms: string | number;
  metric: string;
  value: string | number | null;
};

type QueueCounts = {
  waiting: number;
  paused: number;
  delayed: number;
  active: number;
  failed: number;
};

type QueueFamily = {
  id: string;
  label: string;
  getQueues: () => Array<{ name: string; queue: Queue | null }>;
};

type DependencyCheck = {
  status: DiagnosticStatus;
  currentValue: string;
  details: DiagnosticDetail[];
  unavailable?: InstanceHealthUnavailableDiagnostic;
};

type QueueDiagnostics = {
  status: DiagnosticStatus;
  currentValue: string;
  details: DiagnosticDetail[];
  unavailableDiagnostics: InstanceHealthUnavailableDiagnostic[];
};

type ClickHouseDiagnostics = {
  status: DiagnosticStatus;
  freshnessStatus: DiagnosticStatus;
  freshnessValue: string;
  freshnessDetails: DiagnosticDetail[];
  capacityStatus: DiagnosticStatus;
  capacityValue: string;
  capacityDetails: DiagnosticDetail[];
  panels: InstanceHealthClickHousePanels;
  unavailableDiagnostics: InstanceHealthUnavailableDiagnostic[];
};

type NonShardedQueueName = Parameters<typeof getQueue>[0];

export const assertSafeDiagnosticClickHouseQuery = (query: string) => {
  const normalized = query.replace(/\s+/g, " ").trim();
  const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
    { label: "FINAL", pattern: /\bFINAL\b/i },
    { label: "OPTIMIZE", pattern: /\bOPTIMIZE\b/i },
    { label: "SYSTEM FLUSH LOGS", pattern: /\bSYSTEM\s+FLUSH\s+LOGS\b/i },
    { label: "JOIN", pattern: /\bJOIN\b/i },
    { label: "SELECT *", pattern: /\bSELECT\s+\*/i },
  ];

  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(normalized)) {
      throw new Error(`Forbidden ClickHouse diagnostic operation: ${label}`);
    }
  }

  const appTableMatch = normalized.match(
    /\bFROM\s+(events_core|events_full|traces|observations)\b/i,
  );
  if (!appTableMatch) return;

  const table = appTableMatch[1].toLowerCase();
  const timeColumn = table === "traces" ? "timestamp" : "start_time";
  const hasUpperBound = new RegExp(
    `\\b${timeColumn}\\s*<=\\s*\\{now:\\s*DateTime64\\(3\\)\\}`,
    "i",
  ).test(normalized);
  const hasLowerBound = new RegExp(
    `\\b${timeColumn}\\s*>=\\s*\\{now:\\s*DateTime64\\(3\\)\\}\\s*-\\s*INTERVAL\\s+${RECENT_WINDOW_MINUTES}\\s+MINUTE`,
    "i",
  ).test(normalized);
  const hasLimit = /\bLIMIT\s+1\b/i.test(normalized);

  if (!hasUpperBound || !hasLowerBound || !hasLimit) {
    throw new Error(
      `Unsafe ClickHouse diagnostic read from ${table}: missing narrow freshness window`,
    );
  }
};

const queryDiagnosticClickHouse = async <T>(opts: {
  query: string;
  params?: Record<string, unknown>;
}) => {
  assertSafeDiagnosticClickHouseQuery(opts.query);

  return queryClickhouse<T>({
    query: opts.query,
    params: opts.params,
    clickhouseSettings: CLICKHOUSE_QUERY_SETTINGS,
    clickhouseConfigs: CLICKHOUSE_QUERY_CONFIGS,
    preferredClickhouseService: "ReadOnly",
    tags: {
      surface: "trpc",
      route: "instanceHealth.get",
    },
  });
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value)) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = Math.max(0, value);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatPercent = (ratio: number): string => {
  if (!Number.isFinite(ratio)) return "unknown";
  return `${Math.round(ratio * 100)}%`;
};

const toNumber = (value: string | number | null | undefined): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
};

const worstStatus = (statuses: DiagnosticStatus[]): DiagnosticStatus =>
  statuses.reduce<DiagnosticStatus>(
    (worst, status) =>
      STATUS_RANK[status] > STATUS_RANK[worst] ? status : worst,
    "ok",
  );

const statusFromRatio = (ratio: number, warning: number, error: number) => {
  if (!Number.isFinite(ratio)) return "unavailable" as const;
  if (ratio >= error) return "error" as const;
  if (ratio >= warning) return "warning" as const;
  return "ok" as const;
};

const safeError = (area: DiagnosticArea, id: string, reason: string) => ({
  id,
  area,
  reason,
});

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs),
    ),
  ]);

const escapeClickHouseString = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const systemTableRef = (table: ClickHouseSystemTable): string => {
  if (env.CLICKHOUSE_CLUSTER_ENABLED === "true") {
    return `clusterAllReplicas('${escapeClickHouseString(env.CLICKHOUSE_CLUSTER_NAME)}', '${table}')`;
  }
  return table;
};

const readPostgres = async (prisma: PrismaClient): Promise<DependencyCheck> => {
  try {
    await withTimeout(
      prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok;`,
      2_000,
      "Postgres ping",
    );

    return {
      status: "ok",
      currentValue: "responding",
      details: [{ label: "Ping", value: "SELECT 1 succeeded", status: "ok" }],
    };
  } catch (error) {
    logger.warn("Instance health Postgres ping failed", { error });
    return {
      status: "error",
      currentValue: "unavailable",
      details: [
        {
          label: "Ping",
          value: "Postgres did not respond to a bounded ping",
          status: "error",
        },
      ],
      unavailable: safeError(
        "postgres",
        "postgres-ping",
        "Postgres ping failed. Check web container logs for connection details.",
      ),
    };
  }
};

const readRedis = async (): Promise<DependencyCheck> => {
  if (!redis) {
    return {
      status: "unavailable",
      currentValue: "not configured",
      details: [
        {
          label: "Redis client",
          value: "No Redis client is available in this web container",
          status: "unavailable",
        },
      ],
      unavailable: safeError(
        "redis",
        "redis-client",
        "Redis client is not available in this web container.",
      ),
    };
  }

  try {
    await withTimeout(redis.ping(), 2_000, "Redis ping");
    return {
      status: "ok",
      currentValue: "responding",
      details: [{ label: "Ping", value: "PONG", status: "ok" }],
    };
  } catch (error) {
    logger.warn("Instance health Redis ping failed", { error });
    return {
      status: "error",
      currentValue: "unavailable",
      details: [
        {
          label: "Ping",
          value: "Redis did not respond within 2 seconds",
          status: "error",
        },
      ],
      unavailable: safeError(
        "redis",
        "redis-ping",
        "Redis ping failed. Queue and worker diagnostics are limited.",
      ),
    };
  }
};

const shardedQueueFamily = (
  id: string,
  label: string,
  queueClass: {
    getShardNames: () => string[];
    getInstance: (input: { shardName?: string }) => Queue | null;
  },
): QueueFamily => ({
  id,
  label,
  getQueues: () =>
    queueClass.getShardNames().map((name) => ({
      name,
      queue: queueClass.getInstance({ shardName: name }),
    })),
});

const nonShardedQueueFamily = (
  id: string,
  label: string,
  queueName: NonShardedQueueName,
): QueueFamily => ({
  id,
  label,
  getQueues: () => [{ name: queueName, queue: getQueue(queueName) }],
});

const QUEUE_FAMILIES: QueueFamily[] = [
  shardedQueueFamily("ingestion", "Ingestion", IngestionQueue),
  shardedQueueFamily(
    "secondary-ingestion",
    "Secondary ingestion",
    SecondaryIngestionQueue,
  ),
  shardedQueueFamily("otel-ingestion", "OTel ingestion", OtelIngestionQueue),
  shardedQueueFamily(
    "secondary-otel-ingestion",
    "Secondary OTel ingestion",
    SecondaryOtelIngestionQueue,
  ),
  shardedQueueFamily("trace-upsert", "Trace upsert", TraceUpsertQueue),
  shardedQueueFamily(
    "eval-execution",
    "Evaluation execution",
    EvalExecutionQueue,
  ),
  shardedQueueFamily(
    "secondary-eval-execution",
    "Secondary evaluation execution",
    SecondaryEvalExecutionQueue,
  ),
  shardedQueueFamily(
    "llm-as-judge",
    "LLM-as-judge execution",
    LLMAsJudgeExecutionQueue,
  ),
  shardedQueueFamily(
    "code-eval",
    "Code eval execution",
    CodeEvalExecutionQueue,
  ),
  nonShardedQueueFamily(
    "dataset-run-items",
    "Dataset run item upsert",
    QueueName.DatasetRunItemUpsert,
  ),
  nonShardedQueueFamily("batch-export", "Batch export", QueueName.BatchExport),
  nonShardedQueueFamily(
    "batch-action",
    "Batch action",
    QueueName.BatchActionQueue,
  ),
  nonShardedQueueFamily(
    "data-retention",
    "Data retention processing",
    QueueName.DataRetentionProcessingQueue,
  ),
  nonShardedQueueFamily("webhook", "Webhooks", QueueName.WebhookQueue),
  nonShardedQueueFamily("monitor", "Monitors", QueueName.MonitorQueue),
  nonShardedQueueFamily(
    "event-propagation",
    "Event propagation",
    QueueName.EventPropagationQueue,
  ),
  nonShardedQueueFamily(
    "dead-letter-retry",
    "Dead letter retry",
    QueueName.DeadLetterRetryQueue,
  ),
];

const getQueueCounts = async (queue: Queue): Promise<QueueCounts> => {
  const counts = await withTimeout(
    queue.getJobCounts("waiting", "paused", "delayed", "active", "failed"),
    3_000,
    `BullMQ ${queue.name} counts`,
  );

  return {
    waiting: counts.waiting ?? 0,
    paused: counts.paused ?? 0,
    delayed: counts.delayed ?? 0,
    active: counts.active ?? 0,
    failed: counts.failed ?? 0,
  };
};

const readQueues = async (): Promise<QueueDiagnostics> => {
  if (!redis) {
    return {
      status: "unavailable",
      currentValue: "Redis unavailable",
      details: [],
      unavailableDiagnostics: [
        safeError(
          "queues",
          "queue-redis-client",
          "Redis client is unavailable, so BullMQ queue counts cannot be read.",
        ),
      ],
    };
  }

  const unavailableDiagnostics: InstanceHealthUnavailableDiagnostic[] = [];
  const details: DiagnosticDetail[] = [];
  const statuses: DiagnosticStatus[] = [];
  let totalWaiting = 0;
  let totalFailed = 0;
  let totalActive = 0;

  await Promise.all(
    QUEUE_FAMILIES.map(async (family) => {
      const queueRefs = family.getQueues();
      const availableQueues = queueRefs.flatMap(({ queue }) =>
        queue ? [queue] : [],
      );

      if (availableQueues.length === 0) {
        statuses.push("unavailable");
        unavailableDiagnostics.push(
          safeError(
            "queues",
            `queue-${family.id}`,
            `${family.label} queue is not available from this web container.`,
          ),
        );
        details.push({
          label: family.label,
          value: "queue unavailable",
          status: "unavailable",
        });
        return;
      }

      try {
        const counts = await Promise.all(
          availableQueues.map(async (queue) => ({
            counts: await getQueueCounts(queue),
          })),
        );

        const aggregate = counts.reduce<QueueCounts>(
          (acc, row) => ({
            waiting: acc.waiting + row.counts.waiting,
            paused: acc.paused + row.counts.paused,
            delayed: acc.delayed + row.counts.delayed,
            active: acc.active + row.counts.active,
            failed: acc.failed + row.counts.failed,
          }),
          { waiting: 0, paused: 0, delayed: 0, active: 0, failed: 0 },
        );

        const backlog =
          aggregate.waiting + aggregate.paused + aggregate.delayed;
        totalWaiting += backlog;
        totalFailed += aggregate.failed;
        totalActive += aggregate.active;

        const status =
          aggregate.failed > 0 || backlog >= QUEUE_BACKLOG_ERROR_THRESHOLD
            ? "error"
            : backlog >= QUEUE_BACKLOG_WARNING_THRESHOLD
              ? "warning"
              : "ok";
        statuses.push(status);
        details.push({
          label: family.label,
          value: `${formatNumber(backlog)} queued, ${formatNumber(aggregate.active)} active, ${formatNumber(aggregate.failed)} failed`,
          status,
        });
      } catch (error) {
        logger.warn("Instance health queue diagnostic failed", {
          queueFamily: family.id,
          error,
        });
        statuses.push("unavailable");
        unavailableDiagnostics.push(
          safeError(
            "queues",
            `queue-${family.id}-counts`,
            `${family.label} counts could not be read.`,
          ),
        );
        details.push({
          label: family.label,
          value: "counts unavailable",
          status: "unavailable",
        });
      }
    }),
  );

  const status = worstStatus(statuses);
  return {
    status,
    currentValue: `${formatNumber(totalWaiting)} queued, ${formatNumber(totalActive)} active, ${formatNumber(totalFailed)} failed`,
    details,
    unavailableDiagnostics,
  };
};

const readClickHouseFreshness = async (): Promise<{
  status: DiagnosticStatus;
  currentValue: string;
  details: DiagnosticDetail[];
  unavailable?: InstanceHealthUnavailableDiagnostic;
}> => {
  const now = convertDateToClickhouseDateTime(new Date());

  try {
    if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "events_only") {
      const rows = await queryDiagnosticClickHouse<{ span_id: string }>({
        query: `
          SELECT span_id
          FROM events_core
          WHERE start_time <= {now: DateTime64(3)}
            AND start_time >= {now: DateTime64(3)} - INTERVAL ${RECENT_WINDOW_MINUTES} MINUTE
          LIMIT 1
        `,
        params: { now },
      });

      return rows.length > 0
        ? {
            status: "ok",
            currentValue: "events seen in the last 3 minutes",
            details: [
              {
                label: "events_core",
                value: "recent row present",
                status: "ok",
              },
            ],
          }
        : {
            status: "warning",
            currentValue: "no events in the last 3 minutes",
            details: [
              {
                label: "events_core",
                value: "no recent row found",
                status: "warning",
              },
            ],
          };
    }

    const [traces, observations] = await Promise.all([
      queryDiagnosticClickHouse<{ id: string }>({
        query: `
          SELECT id
          FROM traces
          WHERE timestamp <= {now: DateTime64(3)}
            AND timestamp >= {now: DateTime64(3)} - INTERVAL ${RECENT_WINDOW_MINUTES} MINUTE
          LIMIT 1
        `,
        params: { now },
      }),
      queryDiagnosticClickHouse<{ id: string }>({
        query: `
          SELECT id
          FROM observations
          WHERE start_time <= {now: DateTime64(3)}
            AND start_time >= {now: DateTime64(3)} - INTERVAL ${RECENT_WINDOW_MINUTES} MINUTE
          LIMIT 1
        `,
        params: { now },
      }),
    ]);

    const details: DiagnosticDetail[] = [
      {
        label: "traces",
        value: traces.length > 0 ? "recent row present" : "no recent row found",
        status: traces.length > 0 ? "ok" : "warning",
      },
      {
        label: "observations",
        value:
          observations.length > 0
            ? "recent row present"
            : "no recent row found",
        status: observations.length > 0 ? "ok" : "warning",
      },
    ];

    const status =
      traces.length > 0 && observations.length > 0 ? "ok" : "warning";
    return {
      status,
      currentValue:
        status === "ok"
          ? "traces and observations seen in the last 3 minutes"
          : "missing recent traces or observations",
      details,
    };
  } catch (error) {
    logger.warn("Instance health ClickHouse freshness diagnostic failed", {
      error,
    });
    return {
      status: "unavailable",
      currentValue: "freshness unavailable",
      details: [
        {
          label: "Freshness",
          value: "bounded recent-row query failed",
          status: "unavailable",
        },
      ],
      unavailable: safeError(
        "clickhouse",
        "clickhouse-freshness",
        "Recent-row freshness queries could not be read.",
      ),
    };
  }
};

const getMetricMap = (rows: ClickHouseMetricRow[]) => {
  const map = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const nodeMetrics = map.get(row.node) ?? new Map<string, number>();
    nodeMetrics.set(row.metric, toNumber(row.value));
    map.set(row.node, nodeMetrics);
  }

  return map;
};

const memoryDetails = (metrics: Map<string, Map<string, number>>) => {
  const details: DiagnosticDetail[] = [];

  for (const [node, values] of metrics) {
    const used =
      values.get("CGroupMemoryUsed") ??
      values.get("MemoryResidentWithoutPageCache") ??
      values.get("MemoryResident");
    const total =
      values.get("CGroupMemoryTotal") ??
      (values.get("OSMemoryTotal") && values.get("OSMemoryAvailable")
        ? values.get("OSMemoryTotal")
        : undefined);

    if (!used) continue;

    if (total && total > 0) {
      const ratio = used / total;
      details.push({
        label: node,
        value: `${formatBytes(used)} / ${formatBytes(total)} (${formatPercent(ratio)})`,
        status: statusFromRatio(ratio, 0.85, 0.95),
      });
    } else {
      details.push({
        label: node,
        value: `${formatBytes(used)} resident`,
        status: "ok",
      });
    }
  }

  return details;
};

const cpuDetails = (metrics: Map<string, Map<string, number>>) => {
  const details: DiagnosticDetail[] = [];

  for (const [node, values] of metrics) {
    const cgroupCpu =
      (values.get("CGroupUserTimeNormalized") ?? 0) +
      (values.get("CGroupSystemTimeNormalized") ?? 0);
    const osCpu =
      (values.get("OSUserTimeNormalized") ?? 0) +
      (values.get("OSSystemTimeNormalized") ?? 0);
    const cpu = cgroupCpu > 0 ? cgroupCpu : osCpu;

    if (!cpu) continue;

    details.push({
      label: node,
      value: formatPercent(cpu),
      status: statusFromRatio(cpu, 0.8, 0.95),
    });
  }

  return details;
};

const diskDetails = (rows: ClickHouseDiskRow[]) =>
  rows.flatMap<DiagnosticDetail>((row) => {
    const total = toNumber(row.total_space);
    const free = toNumber(row.free_space);
    if (total <= 0) return [];

    const used = Math.max(0, total - free);
    const ratio = used / total;

    return [
      {
        label: `${row.node} / ${row.name}`,
        value: `${formatBytes(used)} / ${formatBytes(total)} (${formatPercent(ratio)})`,
        status: statusFromRatio(ratio, 0.85, 0.95),
      },
    ];
  });

const prepareHistorySeries = (
  rows: ClickHouseHistoryRow[],
  range: InstanceHealthTimeRange,
) => {
  const panels: Record<
    "memory" | "cpu" | "disk",
    Map<string, InstanceHealthMetricSeries>
  > = {
    memory: new Map(),
    cpu: new Map(),
    disk: new Map(),
  };

  const panelForMetric = (metric: string): "memory" | "cpu" | "disk" | null => {
    if ((MEMORY_METRICS as readonly string[]).includes(metric)) return "memory";
    if ((CPU_METRICS as readonly string[]).includes(metric)) return "cpu";
    if (metric.startsWith("Disk") || metric.startsWith("Filesystem"))
      return "disk";
    return null;
  };

  for (const row of rows) {
    const panel = panelForMetric(row.metric);
    if (!panel) continue;

    const seriesId = `${panel}:${row.node}:${row.metric}`;
    const existing =
      panels[panel].get(seriesId) ??
      ({
        id: seriesId,
        node: row.node,
        label: row.metric,
        unit: panel === "memory" || panel === "disk" ? "bytes" : "ratio",
        points: [],
      } satisfies InstanceHealthMetricSeries);

    existing.points.push({
      timestamp: new Date(toNumber(row.timestamp_ms)).toISOString(),
      value: row.value === null ? null : toNumber(row.value),
    });
    panels[panel].set(seriesId, existing);
  }

  const topSeries = (series: InstanceHealthMetricSeries[]) =>
    series
      .sort((a, b) => {
        const aLast = [...a.points]
          .reverse()
          .find((point) => point.value !== null);
        const bLast = [...b.points]
          .reverse()
          .find((point) => point.value !== null);
        return (bLast?.value ?? 0) - (aLast?.value ?? 0);
      })
      .slice(0, 12);

  return {
    memory: {
      range,
      series: topSeries(Array.from(panels.memory.values())),
    },
    cpu: {
      range,
      series: topSeries(Array.from(panels.cpu.values())),
    },
    disk: {
      range,
      series: topSeries(Array.from(panels.disk.values())),
    },
  };
};

const emptyClickHousePanels = (
  range: InstanceHealthTimeRange,
  emptyState: string,
): InstanceHealthClickHousePanels => ({
  summary: [{ label: "ClickHouse", value: emptyState, status: "unavailable" }],
  metrics: [
    {
      id: "memory",
      title: "Memory",
      status: "unavailable",
      current: [],
      history: { range, series: [], emptyState },
    },
    {
      id: "cpu",
      title: "CPU",
      status: "unavailable",
      current: [],
      history: { range, series: [], emptyState },
    },
    {
      id: "disk",
      title: "Disk",
      status: "unavailable",
      current: [],
      history: { range, series: [], emptyState },
    },
  ],
  tables: { status: "unavailable", rows: [], emptyState },
});

const readClickHouse = async (
  range: InstanceHealthTimeRange,
): Promise<ClickHouseDiagnostics> => {
  const unavailableDiagnostics: InstanceHealthUnavailableDiagnostic[] = [];

  try {
    await queryDiagnosticClickHouse<{ ok: number }>({
      query: "SELECT 1 AS ok",
    });
  } catch (error) {
    logger.warn("Instance health ClickHouse ping failed", { error });
    const unavailable = safeError(
      "clickhouse",
      "clickhouse-ping",
      "ClickHouse ping failed. Check web container logs for connection details.",
    );
    return {
      status: "error",
      freshnessStatus: "unavailable",
      freshnessValue: "freshness unavailable",
      freshnessDetails: [],
      capacityStatus: "unavailable",
      capacityValue: "capacity unavailable",
      capacityDetails: [],
      panels: emptyClickHousePanels(range, "ClickHouse did not respond"),
      unavailableDiagnostics: [unavailable],
    };
  }

  const freshness = await readClickHouseFreshness();
  if (freshness.unavailable) unavailableDiagnostics.push(freshness.unavailable);

  let metricRows: ClickHouseMetricRow[] = [];
  let diskRows: ClickHouseDiskRow[] = [];
  let tableRows: ClickHouseTableRow[] = [];
  let hasMetricLog = false;

  await Promise.all([
    queryDiagnosticClickHouse<ClickHouseMetricRow>({
      query: `
        SELECT hostName() AS node, metric, value
        FROM ${systemTableRef("system.asynchronous_metrics")}
        WHERE metric IN {metrics: Array(String)}
        ORDER BY node ASC, metric ASC
        LIMIT 1000
      `,
      params: { metrics: [...CURRENT_CLICKHOUSE_METRICS] },
    })
      .then((rows) => {
        metricRows = rows;
      })
      .catch((error) => {
        logger.warn("Instance health ClickHouse metric query failed", {
          error,
        });
        unavailableDiagnostics.push(
          safeError(
            "clickhouse",
            "clickhouse-current-metrics",
            "Current ClickHouse asynchronous metrics could not be read.",
          ),
        );
      }),
    queryDiagnosticClickHouse<ClickHouseDiskRow>({
      query: `
        SELECT
          hostName() AS node,
          name,
          type,
          free_space,
          total_space,
          unreserved_space,
          keep_free_space
        FROM ${systemTableRef("system.disks")}
        ORDER BY node ASC, name ASC
        LIMIT 200
      `,
    })
      .then((rows) => {
        diskRows = rows;
      })
      .catch((error) => {
        logger.warn("Instance health ClickHouse disk query failed", { error });
        unavailableDiagnostics.push(
          safeError(
            "clickhouse",
            "clickhouse-disks",
            "ClickHouse disk metadata could not be read.",
          ),
        );
      }),
    queryDiagnosticClickHouse<ClickHouseTableRow>({
      query: `
        SELECT
          hostName() AS node,
          database,
          name AS table,
          engine,
          total_rows,
          total_bytes,
          parts,
          active_parts
        FROM ${systemTableRef("system.tables")}
        WHERE database = {database: String}
          AND is_temporary = 0
        ORDER BY total_bytes DESC
        LIMIT 50
      `,
      params: { database: env.CLICKHOUSE_DB },
    })
      .then((rows) => {
        tableRows = rows;
      })
      .catch((error) => {
        logger.warn("Instance health ClickHouse table metadata query failed", {
          error,
        });
        unavailableDiagnostics.push(
          safeError(
            "clickhouse",
            "clickhouse-table-sizes",
            "ClickHouse table-size metadata could not be read.",
          ),
        );
      }),
    queryDiagnosticClickHouse<{ count: string | number }>({
      query: `
        SELECT count() AS count
        FROM ${systemTableRef("system.tables")}
        WHERE database = {systemDatabase: String}
          AND name = 'asynchronous_metric_log'
        LIMIT 1
      `,
      params: { systemDatabase: "system" },
    })
      .then((rows) => {
        hasMetricLog = toNumber(rows[0]?.count) > 0;
      })
      .catch((error) => {
        logger.warn("Instance health ClickHouse metric-log detection failed", {
          error,
        });
      }),
  ]);

  let historyRows: ClickHouseHistoryRow[] = [];
  const rangeConfig = TIME_RANGE_CONFIG[range];
  if (rangeConfig && hasMetricLog) {
    try {
      historyRows = await queryDiagnosticClickHouse<ClickHouseHistoryRow>({
        query: `
          SELECT
            hostName() AS node,
            toUnixTimestamp(toStartOfInterval(event_time, INTERVAL ${rangeConfig.bucketMinutes} MINUTE)) * 1000 AS timestamp_ms,
            metric,
            avg(value) AS value
          FROM ${systemTableRef("system.asynchronous_metric_log")}
          WHERE event_time >= now() - INTERVAL ${rangeConfig.hours} HOUR
            AND (
              metric IN {metrics: Array(String)}
              OR startsWith(metric, 'Disk')
              OR startsWith(metric, 'Filesystem')
            )
          GROUP BY node, timestamp_ms, metric
          ORDER BY timestamp_ms ASC, node ASC, metric ASC
          LIMIT 5000
        `,
        params: { metrics: [...MEMORY_METRICS, ...CPU_METRICS] },
      });
    } catch (error) {
      logger.warn("Instance health ClickHouse history query failed", { error });
      unavailableDiagnostics.push(
        safeError(
          "clickhouse",
          "clickhouse-history",
          "ClickHouse metric history could not be read.",
        ),
      );
    }
  } else if (rangeConfig && !hasMetricLog) {
    unavailableDiagnostics.push(
      safeError(
        "clickhouse",
        "clickhouse-history",
        "ClickHouse system.asynchronous_metric_log is unavailable; showing current values only.",
      ),
    );
  }

  const metricMap = getMetricMap(metricRows);
  const memory = memoryDetails(metricMap);
  const cpu = cpuDetails(metricMap);
  const disk = diskDetails(diskRows);
  const history = prepareHistorySeries(historyRows, range);
  const historyEmptyState =
    range === "now"
      ? "Select 1h, 6h, or 24h to load metric history"
      : hasMetricLog
        ? "No metric history returned for this range"
        : "system.asynchronous_metric_log is unavailable; showing current values only";

  const metricPanels: InstanceHealthClickHouseMetricPanel[] = [
    {
      id: "memory",
      title: "Memory",
      status: memory.length
        ? worstStatus(memory.map((row) => row.status ?? "ok"))
        : "unavailable",
      current: memory,
      history: {
        ...history.memory,
        emptyState:
          history.memory.series.length === 0 ? historyEmptyState : undefined,
      },
    },
    {
      id: "cpu",
      title: "CPU",
      status: cpu.length
        ? worstStatus(cpu.map((row) => row.status ?? "ok"))
        : "unavailable",
      current: cpu,
      history: {
        ...history.cpu,
        emptyState:
          history.cpu.series.length === 0 ? historyEmptyState : undefined,
      },
    },
    {
      id: "disk",
      title: "Disk",
      status: disk.length
        ? worstStatus(disk.map((row) => row.status ?? "ok"))
        : "unavailable",
      current: disk,
      history: {
        ...history.disk,
        emptyState:
          history.disk.series.length === 0 ? historyEmptyState : undefined,
      },
    },
  ];

  const tableSizeRows = tableRows.map((row) => ({
    node: row.node,
    database: row.database,
    table: row.table,
    engine: row.engine,
    rows: formatNumber(toNumber(row.total_rows)),
    bytes: formatBytes(toNumber(row.total_bytes)),
    parts: formatNumber(toNumber(row.active_parts ?? row.parts)),
    status: "ok" as const,
  }));

  const capacityDetails = [
    ...memory.slice(0, 8),
    ...cpu.slice(0, 8),
    ...disk.slice(0, 8),
  ];
  const capacityStatus = capacityDetails.length
    ? worstStatus(capacityDetails.map((row) => row.status ?? "ok"))
    : "unavailable";

  const panels: InstanceHealthClickHousePanels = {
    summary: [
      {
        label: "Nodes",
        value: formatNumber(
          new Set([...metricMap.keys(), ...diskRows.map((row) => row.node)])
            .size || 1,
        ),
        status: "ok",
      },
      {
        label: "Metric history",
        value: hasMetricLog ? "available" : "current only",
        status: hasMetricLog ? "ok" : "unavailable",
      },
      {
        label: "Table metadata",
        value: tableSizeRows.length
          ? `${formatNumber(tableSizeRows.length)} tables`
          : "unavailable",
        status: tableSizeRows.length ? "ok" : "unavailable",
      },
    ],
    metrics: metricPanels,
    tables: {
      status: tableSizeRows.length ? "ok" : "unavailable",
      rows: tableSizeRows,
      emptyState:
        tableSizeRows.length === 0
          ? "ClickHouse table metadata is unavailable"
          : undefined,
    },
  };

  return {
    status: worstStatus([
      "ok",
      freshness.status,
      capacityStatus,
      ...metricPanels.map((panel) => panel.status),
    ]),
    freshnessStatus: freshness.status,
    freshnessValue: freshness.currentValue,
    freshnessDetails: freshness.details,
    capacityStatus,
    capacityValue: capacityDetails.length
      ? `${formatNumber(capacityDetails.length)} current capacity signals`
      : "capacity unavailable",
    capacityDetails,
    panels,
    unavailableDiagnostics,
  };
};

const addFinding = (
  findings: InstanceHealthFinding[],
  input: Omit<InstanceHealthFinding, "id">,
) => {
  if (input.status === "ok") return;

  findings.push({
    id: `${input.area}-${findings.length + 1}`,
    ...input,
  });
};

export const getInstanceHealth = async ({
  prisma,
  timeRange,
}: {
  prisma: PrismaClient;
  timeRange: InstanceHealthTimeRange;
}): Promise<InstanceHealthResponse> => {
  const generatedAt = new Date().toISOString();
  const [postgres, redisCheck, queues, clickhouse] = await Promise.all([
    readPostgres(prisma),
    readRedis(),
    readQueues(),
    readClickHouse(timeRange),
  ]);

  const unavailableDiagnostics = [
    postgres.unavailable,
    redisCheck.unavailable,
    ...queues.unavailableDiagnostics,
    ...clickhouse.unavailableDiagnostics,
  ].filter(Boolean) as InstanceHealthUnavailableDiagnostic[];

  const workerStatus =
    queues.status === "unavailable"
      ? "unavailable"
      : queues.status === "error"
        ? "warning"
        : queues.status;

  const findings: InstanceHealthFinding[] = [];
  addFinding(findings, {
    area: "postgres",
    status: postgres.status,
    title: "Postgres dependency is not healthy",
    evidence: postgres.currentValue,
    nextAction: "Check the Postgres container and DATABASE_URL wiring.",
  });
  addFinding(findings, {
    area: "redis",
    status: redisCheck.status,
    title: "Redis dependency is not healthy",
    evidence: redisCheck.currentValue,
    nextAction: "Check Redis connectivity from the web container.",
  });
  addFinding(findings, {
    area: "queues",
    status: queues.status,
    title: "Queue backlog or failed jobs need attention",
    evidence: queues.currentValue,
    nextAction: "Inspect worker logs and retry or drain failed BullMQ jobs.",
  });
  addFinding(findings, {
    area: "clickhouse",
    status: clickhouse.freshnessStatus,
    title: "Ingestion freshness is stale or unavailable",
    evidence: clickhouse.freshnessValue,
    nextAction:
      "Confirm ingestion workers are running and ClickHouse writes are succeeding.",
  });
  addFinding(findings, {
    area: "capacity",
    status: clickhouse.capacityStatus,
    title: "ClickHouse capacity signals need attention",
    evidence: clickhouse.capacityValue,
    nextAction: "Check ClickHouse memory, CPU, disk, and table growth.",
  });

  const rankedFindings = findings
    .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status])
    .slice(0, 3);

  const runbookSteps: InstanceHealthRunbookStep[] = [
    {
      id: "dependencies",
      order: 1,
      area: "postgres",
      status: worstStatus([postgres.status, redisCheck.status]),
      title: "Dependencies",
      signal: "Postgres and Redis pings",
      expected: "Both dependencies respond within 2 seconds",
      lastChecked: generatedAt,
      details: [...postgres.details, ...redisCheck.details],
    },
    {
      id: "ingestion-freshness",
      order: 2,
      area: "clickhouse",
      status: clickhouse.freshnessStatus,
      title: "Ingestion freshness",
      signal: "Recent ClickHouse rows",
      expected: "At least one row in the last 3 minutes",
      lastChecked: generatedAt,
      details: clickhouse.freshnessDetails,
    },
    {
      id: "queues",
      order: 3,
      area: "queues",
      status: queues.status,
      title: "Queues",
      signal: "BullMQ waiting, delayed, active, and failed counts",
      expected: "Failed jobs at 0 and queued jobs below 1,000 per family",
      lastChecked: generatedAt,
      details: queues.details,
    },
    {
      id: "worker-signal",
      order: 4,
      area: "worker",
      status: workerStatus,
      title: "Worker signal",
      signal: "Inferred from queue counters",
      expected: "Workers are draining queues and failures are not accumulating",
      lastChecked: generatedAt,
      details: [
        {
          label: "Worker liveness",
          value: "inferred from BullMQ metadata; no worker HTTP endpoint in V1",
          status: workerStatus,
        },
      ],
    },
    {
      id: "clickhouse-capacity",
      order: 5,
      area: "capacity",
      status: clickhouse.capacityStatus,
      title: "ClickHouse capacity",
      signal: "System metrics, disks, and table metadata",
      expected: "Memory, CPU, and disk stay below warning thresholds",
      lastChecked: generatedAt,
      details: clickhouse.capacityDetails,
    },
  ];

  const ledgerRows: InstanceHealthLedgerRow[] = [
    {
      id: "web",
      area: "web",
      status: "ok",
      signal: "Web diagnostics request",
      currentValue: "served",
      expected: "The organization settings page can fetch diagnostics",
      lastChecked: generatedAt,
      details: [
        {
          label: "Diagnostics surface",
          value: "read-only tRPC request served by this web container",
          status: "ok",
        },
      ],
    },
    {
      id: "postgres",
      area: "postgres",
      status: postgres.status,
      signal: "Postgres ping",
      currentValue: postgres.currentValue,
      expected: "SELECT 1 succeeds",
      lastChecked: generatedAt,
      details: postgres.details,
    },
    {
      id: "redis",
      area: "redis",
      status: redisCheck.status,
      signal: "Redis ping",
      currentValue: redisCheck.currentValue,
      expected: "PONG within 2 seconds",
      lastChecked: generatedAt,
      details: redisCheck.details,
    },
    {
      id: "queues",
      area: "queues",
      status: queues.status,
      signal: "BullMQ queue counts",
      currentValue: queues.currentValue,
      expected: "No failed jobs and bounded backlog",
      lastChecked: generatedAt,
      details: queues.details,
    },
    {
      id: "worker-signal",
      area: "worker",
      status: workerStatus,
      signal: "Worker signal",
      currentValue: "inferred from queue activity",
      expected: "Queues are draining without accumulated failures",
      lastChecked: generatedAt,
      details: [
        {
          label: "Direct worker diagnostics",
          value: "not configured in V1",
          status: "unavailable",
        },
      ],
    },
    {
      id: "clickhouse-freshness",
      area: "clickhouse",
      status: clickhouse.freshnessStatus,
      signal: "Recent rows",
      currentValue: clickhouse.freshnessValue,
      expected: "Recent trace/observation or event row within 3 minutes",
      lastChecked: generatedAt,
      details: clickhouse.freshnessDetails,
    },
    {
      id: "clickhouse-capacity",
      area: "capacity",
      status: clickhouse.capacityStatus,
      signal: "ClickHouse capacity",
      currentValue: clickhouse.capacityValue,
      expected: "Current system metrics remain below thresholds",
      lastChecked: generatedAt,
      details: clickhouse.capacityDetails,
    },
    ...unavailableDiagnostics.map((diagnostic) => ({
      id: `unavailable-${diagnostic.id}`,
      area: diagnostic.area,
      status: "unavailable" as const,
      signal: "Unavailable diagnostic",
      currentValue: diagnostic.reason,
      expected: "Diagnostic source is readable",
      lastChecked: generatedAt,
      details: [
        {
          label: "Reason",
          value: diagnostic.reason,
          status: "unavailable" as const,
        },
      ],
    })),
  ];

  const overallStatus = worstStatus([
    postgres.status,
    redisCheck.status,
    queues.status,
    clickhouse.status,
  ]);

  return {
    overallStatus,
    generatedAt,
    findings: rankedFindings,
    topologyNodes: [
      {
        id: "web",
        area: "web",
        label: "Web",
        status: "ok",
        summary: "Dashboard request served by this web container",
      },
      {
        id: "postgres",
        area: "postgres",
        label: "Postgres",
        status: postgres.status,
        summary: postgres.currentValue,
      },
      {
        id: "redis",
        area: "redis",
        label: "Redis",
        status: redisCheck.status,
        summary: redisCheck.currentValue,
      },
      {
        id: "queues",
        area: "queues",
        label: "Queues",
        status: queues.status,
        summary: queues.currentValue,
      },
      {
        id: "worker",
        area: "worker",
        label: "Worker signal",
        status: workerStatus,
        summary: "inferred from queue counters",
      },
      {
        id: "clickhouse",
        area: "clickhouse",
        label: "ClickHouse",
        status: clickhouse.status,
        summary: clickhouse.freshnessValue,
      },
    ],
    topologyEdges: [
      { from: "web", to: "redis", status: redisCheck.status },
      { from: "redis", to: "queues", status: queues.status },
      { from: "queues", to: "worker", status: workerStatus },
      { from: "worker", to: "clickhouse", status: clickhouse.status },
      { from: "web", to: "postgres", status: postgres.status },
    ],
    runbookSteps,
    ledgerRows,
    clickhousePanels: clickhouse.panels,
    unavailableDiagnostics,
  };
};
