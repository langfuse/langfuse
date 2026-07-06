export const DELETED_MASK_CLEANER_TABLES = [
  "events_core",
  "events_full",
  "traces",
  "observations",
  "scores",
] as const;

const DELETED_MASK_CLEANER_TABLE_SET = new Set<string>(
  DELETED_MASK_CLEANER_TABLES,
);
const MONTH_PARTITION_REGEX = /^\d{6}$/;

export interface WorkCandidateRow {
  partition: string;
  table: string;
  partition_to_clean: string;
  total_rows: number | string;
}

export interface ClickHouseDdlConfig {
  database: string;
  clusterEnabled: boolean;
  clusterName?: string;
}

export interface CandidateSelection {
  candidate: WorkCandidateRow | null;
  skipped: Array<{
    candidate: WorkCandidateRow;
    mutationCount: number;
  }>;
}

export interface MutationCountRow {
  table: string;
  mutation_count: number | string;
}

export const DELETED_MASK_CLEANER_WORK_QUERY = `
  SELECT
    partition,
    table,
    splitByString('-', partition)[3] AS partition_to_clean,
    sum(rows) AS total_rows
  FROM system.parts
  WHERE table IN ({tables: Array(String)})
    AND database = {database: String}
    AND partition LIKE 'patch-%'
    AND partition_to_clean <> ''
    AND partition_to_clean <> toString(toYYYYMM(now()))
    AND active = 1
  GROUP BY partition, table
  ORDER BY total_rows DESC, table
  LIMIT 1 BY table
`;

function assertClickHouseName(value: string, label: string): void {
  if (value.length === 0 || value.includes("\0")) {
    throw new Error(`Invalid ClickHouse ${label}: ${value}`);
  }
}

export function isDeletedMaskCleanerTable(table: string): boolean {
  return DELETED_MASK_CLEANER_TABLE_SET.has(table);
}

function assertTargetTable(table: string): void {
  if (!isDeletedMaskCleanerTable(table)) {
    throw new Error(`Invalid ClickHouse table: ${table}`);
  }
}

function assertMonthPartition(partition: string): void {
  if (!MONTH_PARTITION_REGEX.test(partition)) {
    throw new Error(`Invalid ClickHouse month partition: ${partition}`);
  }
}

function quoteClickhouseString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function quoteClickhouseIdentifier(value: string, label: string): string {
  assertClickHouseName(value, label);
  return `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
}

function buildMutationSource(
  useClusterAllReplicas: boolean,
  clusterName: string,
): string {
  if (useClusterAllReplicas) {
    assertClickHouseName(clusterName, "cluster");
  }

  return useClusterAllReplicas
    ? `clusterAllReplicas(${quoteClickhouseString(clusterName)}, 'system.mutations')`
    : "system.mutations";
}

export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "AbortError" ||
    error.message.toLowerCase().includes("aborted")
  );
}

export function selectCandidateToProcess(
  candidates: WorkCandidateRow[],
  mutationCounts: Map<string, number>,
): CandidateSelection {
  const skipped: CandidateSelection["skipped"] = [];

  for (const candidate of candidates) {
    const mutationCount = mutationCounts.get(candidate.table) ?? 0;
    if (mutationCount > 0) {
      skipped.push({ candidate, mutationCount });
      continue;
    }

    return { candidate, skipped };
  }

  return { candidate: null, skipped };
}

export function normalizeMutationCounts(
  tables: string[],
  rows: MutationCountRow[],
): Map<string, number> {
  const mutationCounts = new Map<string, number>();
  for (const table of tables) {
    mutationCounts.set(table, 0);
  }

  for (const row of rows) {
    if (mutationCounts.has(row.table)) {
      mutationCounts.set(row.table, Number(row.mutation_count));
    }
  }

  return mutationCounts;
}

export function shouldUseDeletedMaskCleanerClusterMode({
  clusterEnabled,
  cleanerClusterModeEnabled,
}: {
  clusterEnabled: boolean;
  cleanerClusterModeEnabled: boolean;
}): boolean {
  return clusterEnabled && cleanerClusterModeEnabled;
}

export function buildApplyDeletedMaskQuery(
  candidate: WorkCandidateRow,
  config: ClickHouseDdlConfig,
): string {
  const database = quoteClickhouseIdentifier(config.database, "database");
  assertTargetTable(candidate.table);
  const table = quoteClickhouseIdentifier(candidate.table, "table");
  assertMonthPartition(candidate.partition_to_clean);

  const clusterClause = config.clusterEnabled
    ? (() => {
        if (!config.clusterName) {
          throw new Error(
            "ClickHouse cluster name is required in cluster mode",
          );
        }
        return ` ON CLUSTER ${quoteClickhouseIdentifier(config.clusterName, "cluster")}`;
      })()
    : "";

  return `ALTER TABLE ${database}.${table}${clusterClause} APPLY DELETED MASK IN PARTITION '${candidate.partition_to_clean}'`;
}

export function buildMutationCountQuery(
  useClusterAllReplicas: boolean,
  clusterName: string,
): string {
  return `
    SELECT
      database,
      table,
      count() AS mutation_count
    FROM ${buildMutationSource(useClusterAllReplicas, clusterName)}
    WHERE database = {database: String}
      AND table IN ({tables: Array(String)})
      AND is_done = 0
    GROUP BY database, table
  `;
}
