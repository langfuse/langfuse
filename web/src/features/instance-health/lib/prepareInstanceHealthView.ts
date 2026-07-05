import type {
  DiagnosticArea,
  DiagnosticStatus,
  InstanceHealthClickHousePanels,
  InstanceHealthClickHouseMetricPanel,
  InstanceHealthLedgerRow,
  InstanceHealthMetricPoint,
  InstanceHealthResponse,
} from "@/src/features/instance-health/types";

export const DIAGNOSTIC_STATUS_ORDER: DiagnosticStatus[] = [
  "error",
  "warning",
  "unavailable",
  "ok",
];

const STATUS_RANK = DIAGNOSTIC_STATUS_ORDER.reduce<
  Record<DiagnosticStatus, number>
>((acc, status, index) => ({ ...acc, [status]: index }), {
  error: 0,
  warning: 1,
  unavailable: 2,
  ok: 3,
});

export type InstanceHealthLedgerFilters = {
  area: DiagnosticArea | "all";
  status: DiagnosticStatus | "all";
};

export type PreparedMetricPoint = InstanceHealthMetricPoint & {
  normalizedValue: number | null;
};

export type PreparedMetricSeries = {
  id: string;
  node: string;
  label: string;
  points: PreparedMetricPoint[];
};

export type PreparedClickHouseMetricPanel =
  InstanceHealthClickHouseMetricPanel & {
    hasHistory: boolean;
    preparedSeries: PreparedMetricSeries[];
  };

export type PreparedClickHousePanels = Omit<
  InstanceHealthClickHousePanels,
  "metrics"
> & {
  metrics: PreparedClickHouseMetricPanel[];
};

export type PreparedOperatorMetric = {
  id: string;
  title: string;
  area: DiagnosticArea;
  status: DiagnosticStatus;
  value: string;
  detail: string;
  series?: PreparedMetricSeries[];
  emptyState?: string;
};

export const sortLedgerRows = (
  rows: InstanceHealthLedgerRow[],
): InstanceHealthLedgerRow[] =>
  [...rows].sort((a, b) => {
    const statusDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (statusDiff !== 0) return statusDiff;
    return a.area.localeCompare(b.area) || a.signal.localeCompare(b.signal);
  });

export const prepareMetricPanel = (
  panel: InstanceHealthClickHouseMetricPanel,
): PreparedClickHouseMetricPanel => {
  const values = panel.history.series.flatMap((series) =>
    series.points.flatMap((point) =>
      point.value !== null && Number.isFinite(point.value) ? [point.value] : [],
    ),
  );
  const maxValue = Math.max(0, ...values);
  const preparedSeries = panel.history.series.map((series) => ({
    id: series.id,
    node: series.node,
    label: series.label,
    points: series.points.map((point) => ({
      ...point,
      normalizedValue:
        point.value === null || maxValue === 0 ? null : point.value / maxValue,
    })),
  }));

  return {
    ...panel,
    hasHistory: preparedSeries.some((series) => series.points.length > 0),
    preparedSeries,
  };
};

const QUEUE_COUNT_PATTERNS = {
  queued: /([\d,]+)\s+queued\b/i,
  failed: /([\d,]+)\s+failed\b/i,
} as const;

const parseQueueCount = (
  value: string,
  label: keyof typeof QUEUE_COUNT_PATTERNS,
): string | null => {
  const match = value.match(QUEUE_COUNT_PATTERNS[label]);
  return match?.[1] ?? null;
};

const firstDetail = (
  details: InstanceHealthLedgerRow["details"],
): string | null => {
  const detail = details?.find((row) => row.value);
  if (!detail) return null;
  return `${detail.label}: ${detail.value}`;
};

const metricFromPanel = (
  panel: PreparedClickHouseMetricPanel | undefined,
  area: DiagnosticArea,
): PreparedOperatorMetric | null => {
  if (!panel) return null;

  const primary = panel.current[0];
  return {
    id: `clickhouse-${panel.id}`,
    title: `ClickHouse ${panel.title}`,
    area,
    status: panel.status,
    value: primary?.value ?? "unavailable",
    detail: primary?.label ?? panel.history.emptyState ?? "Current only",
    series: panel.preparedSeries.slice(0, 2),
    emptyState: panel.history.emptyState,
  };
};

const buildOperatorMetrics = (
  response: InstanceHealthResponse,
  clickhousePanels: PreparedClickHousePanels,
): PreparedOperatorMetric[] => {
  const ledgerById = new Map(response.ledgerRows.map((row) => [row.id, row]));
  const queueRow = ledgerById.get("queues");
  const freshnessRow = ledgerById.get("clickhouse-freshness");
  const topTable = response.clickhousePanels.tables.rows[0];
  const tableSummary = response.clickhousePanels.summary.find(
    (row) => row.label === "Table metadata",
  );

  return [
    freshnessRow
      ? {
          id: "ingestion-freshness",
          title: "Ingestion freshness",
          area: "clickhouse" as const,
          status: freshnessRow.status,
          value: "3 min window",
          detail:
            firstDetail(freshnessRow.details) ?? freshnessRow.currentValue,
        }
      : null,
    queueRow
      ? {
          id: "queue-backlog",
          title: "Queue backlog",
          area: "queues" as const,
          status: queueRow.status,
          value: parseQueueCount(queueRow.currentValue, "queued") ?? "unknown",
          detail: queueRow.currentValue,
        }
      : null,
    queueRow
      ? {
          id: "queue-failures",
          title: "Failed jobs",
          area: "queues" as const,
          status: queueRow.status === "ok" ? "ok" : queueRow.status,
          value: parseQueueCount(queueRow.currentValue, "failed") ?? "unknown",
          detail: "BullMQ failed count across queue families",
        }
      : null,
    metricFromPanel(
      clickhousePanels.metrics.find((panel) => panel.id === "memory"),
      "capacity",
    ),
    metricFromPanel(
      clickhousePanels.metrics.find((panel) => panel.id === "cpu"),
      "capacity",
    ),
    metricFromPanel(
      clickhousePanels.metrics.find((panel) => panel.id === "disk"),
      "capacity",
    ),
    topTable
      ? {
          id: "largest-table",
          title: "Largest ClickHouse table",
          area: "capacity" as const,
          status: topTable.status,
          value: topTable.bytes,
          detail: `${topTable.database}.${topTable.table} · ${topTable.rows} rows`,
        }
      : tableSummary
        ? {
            id: "table-metadata",
            title: "ClickHouse tables",
            area: "capacity" as const,
            status:
              tableSummary.status ?? response.clickhousePanels.tables.status,
            value: tableSummary.value,
            detail:
              response.clickhousePanels.tables.emptyState ??
              "Table metadata from system.tables",
          }
        : null,
  ].flatMap((metric) => (metric ? [metric] : []));
};

export const prepareInstanceHealthView = (
  response: InstanceHealthResponse,
  filters: InstanceHealthLedgerFilters,
) => {
  const ledgerRows = sortLedgerRows(response.ledgerRows).filter((row) => {
    if (filters.area !== "all" && row.area !== filters.area) return false;
    if (filters.status !== "all" && row.status !== filters.status) return false;
    return true;
  });

  const areaOptions = Array.from(
    new Set(response.ledgerRows.map((row) => row.area)),
  ).sort();

  const statusOptions = DIAGNOSTIC_STATUS_ORDER.filter((status) =>
    response.ledgerRows.some((row) => row.status === status),
  );

  const clickhousePanels = {
    ...response.clickhousePanels,
    metrics: response.clickhousePanels.metrics.map(prepareMetricPanel),
  };

  return {
    ...response,
    ledgerRows,
    areaOptions,
    statusOptions,
    clickhousePanels,
    operatorMetrics: buildOperatorMetrics(response, clickhousePanels),
  };
};
