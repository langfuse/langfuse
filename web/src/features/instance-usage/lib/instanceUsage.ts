/**
 * Shared contract and pure aggregation logic for the instance usage page.
 *
 * Kept free of server imports so both the tRPC router and the client-side CSV
 * download work off the same shapes.
 */

/** V4 write mode, mirrored from `LANGFUSE_MIGRATION_V4_WRITE_MODE`. */
export type InstanceDataModel = "legacy" | "dual" | "events_only";

/** Every tracing table we report storage for. */
export const INSTANCE_USAGE_STORAGE_TABLES = [
  "traces",
  "observations",
  "scores",
  "events_full",
  "events_core",
] as const;

export type InstanceUsageStorageTable =
  (typeof INSTANCE_USAGE_STORAGE_TABLES)[number];

/** A pivot column: one tracing entity, backed by one ClickHouse table. */
export type UsageEntity = {
  key: string;
  label: string;
  table: InstanceUsageStorageTable;
};

export type InstanceUsagePartitionRow = {
  table: string;
  /** `YYYY-MM`, derived from the table's `toYYYYMM` partition id. */
  month: string;
  rows: number;
  onDiskBytes: number;
  uncompressedBytes: number;
  parts: number;
};

export type InstanceUsageMonth = {
  month: string;
  /** True for the month still being written to, whose totals are incomplete. */
  isPartial: boolean;
  /** Entity key -> row count. Missing tables contribute 0. */
  counts: Record<string, number>;
  /** Sum of `counts`, the instance's tracing units for the month. */
  tracingUnits: number;
  /** On-disk bytes of every tracing table for that month, not just the units. */
  onDiskBytes: number;
  uncompressedBytes: number;
};

export type InstanceUsageStorageRow = {
  table: string;
  rows: number;
  onDiskBytes: number;
  uncompressedBytes: number;
  parts: number;
  partitions: number;
};

export type InstanceUsageResponse = {
  generatedAt: string;
  instance: {
    dataModel: InstanceDataModel;
    organizations: number;
    projects: number;
    users: number;
    projectsWithRetention: number;
    postgresBytes: number | null;
  };
  entities: UsageEntity[];
  months: InstanceUsageMonth[];
  storage: InstanceUsageStorageRow[];
  warnings: string[];
};

/**
 * Which tables carry the instance's tracing entities.
 *
 * In `events_only` a trace is no longer a stored row of its own — the root span
 * in `events_core` is the trace — so the pivot reports spans rather than
 * splitting traces from observations. `dual` writes both the legacy tables and
 * `events_full`/`events_core`; counting both would double the units, so the
 * legacy tables stay authoritative there and the events tables show up only
 * under storage.
 */
export const resolveUsageEntities = (
  dataModel: InstanceDataModel,
): UsageEntity[] =>
  dataModel === "events_only"
    ? [
        { key: "events", label: "Spans", table: "events_core" },
        { key: "scores", label: "Scores", table: "scores" },
      ]
    : [
        { key: "traces", label: "Traces", table: "traces" },
        { key: "observations", label: "Observations", table: "observations" },
        { key: "scores", label: "Scores", table: "scores" },
      ];

const toMonthKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Folds raw partition rows into the monthly pivot plus a per-table storage
 * summary.
 */
export const buildMonthlyUsage = ({
  partitionRows,
  entities,
  now,
}: {
  partitionRows: InstanceUsagePartitionRow[];
  entities: UsageEntity[];
  now: Date;
}): { months: InstanceUsageMonth[]; storage: InstanceUsageStorageRow[] } => {
  const currentMonth = toMonthKey(now);
  const entityByTable = new Map(
    entities.map((entity) => [entity.table, entity]),
  );

  const monthsByKey = new Map<string, InstanceUsageMonth>();
  const storageByTable = new Map<string, InstanceUsageStorageRow>();

  for (const row of partitionRows) {
    const month = monthsByKey.get(row.month) ?? {
      month: row.month,
      isPartial: row.month === currentMonth,
      counts: Object.fromEntries(entities.map((entity) => [entity.key, 0])),
      tracingUnits: 0,
      onDiskBytes: 0,
      uncompressedBytes: 0,
    };

    // Bytes cover every tracing table: `events_full` holds the payloads and is
    // usually the bulk of the disk footprint, so leaving it out would badly
    // understate what a month of traffic costs to store.
    month.onDiskBytes += row.onDiskBytes;
    month.uncompressedBytes += row.uncompressedBytes;

    const entity = entityByTable.get(row.table as InstanceUsageStorageTable);
    if (entity) {
      month.counts[entity.key] += row.rows;
      month.tracingUnits += row.rows;
    }

    monthsByKey.set(row.month, month);

    const storage = storageByTable.get(row.table) ?? {
      table: row.table,
      rows: 0,
      onDiskBytes: 0,
      uncompressedBytes: 0,
      parts: 0,
      partitions: 0,
    };
    storage.rows += row.rows;
    storage.onDiskBytes += row.onDiskBytes;
    storage.uncompressedBytes += row.uncompressedBytes;
    storage.parts += row.parts;
    storage.partitions += 1;
    storageByTable.set(row.table, storage);
  }

  return {
    months: [...monthsByKey.values()].sort((a, b) =>
      b.month.localeCompare(a.month),
    ),
    storage: [...storageByTable.values()].sort((a, b) =>
      a.table.localeCompare(b.table),
    ),
  };
};

/** Days of the month that have elapsed, used for the average-per-day column. */
export const daysElapsedInMonth = (month: string, now: Date): number => {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return 0;

  const isCurrentMonth =
    year === now.getUTCFullYear() && monthNumber === now.getUTCMonth() + 1;
  if (isCurrentMonth) return now.getUTCDate();

  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
};

const csvCell = (value: string | number): string => {
  const asString = String(value);
  return /[",\n]/.test(asString)
    ? `"${asString.replaceAll('"', '""')}"`
    : asString;
};

const csvRow = (cells: (string | number)[]): string =>
  cells.map(csvCell).join(",");

/**
 * Renders the page's data as a CSV an operator can hand to us unchanged.
 *
 * A leading `Key,Value` preamble carries the instance context (version, data
 * model, scope) because the file travels on its own, detached from the page that
 * produced it. Spreadsheets read this fine; the tabular section starts after the
 * blank line.
 */
export const buildInstanceUsageCsv = ({
  data,
  version,
  now,
}: {
  data: InstanceUsageResponse;
  version: string;
  now: Date;
}): string => {
  const preamble: (string | number)[][] = [
    ["Key", "Value"],
    ["Langfuse version", version],
    ["Data model", data.instance.dataModel],
    ["Generated at (UTC)", data.generatedAt],
    ["Organizations", data.instance.organizations],
    ["Projects", data.instance.projects],
    ["Users", data.instance.users],
    ["Projects with retention configured", data.instance.projectsWithRetention],
    ["Postgres size (bytes)", data.instance.postgresBytes ?? ""],
  ];

  const header = [
    "Month",
    ...data.entities.map((entity) => entity.label),
    "Tracing units",
    "Avg tracing units per day",
    "ClickHouse on disk (bytes)",
    "ClickHouse uncompressed (bytes)",
    "Month complete",
  ];

  const rows = data.months.map((month) => {
    const days = daysElapsedInMonth(month.month, now);
    return [
      month.month,
      ...data.entities.map((entity) => month.counts[entity.key] ?? 0),
      month.tracingUnits,
      days > 0 ? Math.round(month.tracingUnits / days) : 0,
      month.onDiskBytes,
      month.uncompressedBytes,
      month.isPartial ? "no" : "yes",
    ];
  });

  return [
    ...preamble.map(csvRow),
    "",
    csvRow(header),
    ...rows.map(csvRow),
  ].join("\n");
};

export const instanceUsageCsvFilename = (now: Date): string =>
  `langfuse-instance-usage-${now.toISOString().slice(0, 10)}.csv`;
