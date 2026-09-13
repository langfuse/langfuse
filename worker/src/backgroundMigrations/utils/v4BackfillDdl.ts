import { env } from "../../env";
import {
  qualifiedClickhouseTableName,
  quoteClickhouseIdentifier,
} from "../../utils/clickhouseIdentifiers";

/**
 * Scratch table created by M2, read by M3/M4, dropped by M5. Single source of
 * truth so the DDL, the `requiredTables` guards and the `system.parts` /
 * `system.replicas` predicates cannot drift apart.
 */
export const PID_TID_SORTING_TABLE = "observations_pid_tid_sorting";

/**
 * The ClickHouse topology the V4 chain emits DDL against. Passed explicitly so
 * the query builders below stay pure and assertable in tests, mirroring
 * `buildApplyDeletedMaskQuery`'s `ClickHouseDdlConfig`.
 */
export interface ClickhouseDdlTarget {
  database: string;
  clusterEnabled: boolean;
  clusterName: string;
}

function clickhouseDdlTarget(): ClickhouseDdlTarget {
  return {
    database: env.CLICKHOUSE_DB,
    clusterEnabled: env.CLICKHOUSE_CLUSTER_ENABLED === "true",
    clusterName: env.CLICKHOUSE_CLUSTER_NAME,
  };
}

/**
 * Returns `ON CLUSTER <name>` when running against a clustered ClickHouse
 * deployment, an empty string otherwise. Shared by every chain step that
 * issues DDL or SYSTEM commands so they fan out to all nodes consistently.
 */
export function onClusterClause(
  target: ClickhouseDdlTarget = clickhouseDdlTarget(),
): string {
  if (!target.clusterEnabled) return "";
  return `ON CLUSTER ${quoteClickhouseIdentifier(target.clusterName, "cluster")}`;
}

/** The scratch table, qualified with the configured database. */
export function pidTidSortingTable(
  target: ClickhouseDdlTarget = clickhouseDdlTarget(),
): string {
  return qualifiedClickhouseTableName(target.database, PID_TID_SORTING_TABLE);
}

function joinSql(...parts: string[]): string {
  return parts.filter((part) => part.length > 0).join(" ");
}

// ============================================================================
// Merge control (M2)
// ============================================================================

/**
 * ClickHouse Cloud (SharedMergeTree) does not support `SYSTEM STOP MERGES`.
 * This per-table setting is the documented equivalent; it is
 * assignment-scoped and persists until explicitly reset.
 */
export function buildDisableSharedMergeTreeMergesQuery(
  target: ClickhouseDdlTarget = clickhouseDdlTarget(),
): string {
  return joinSql(
    "ALTER TABLE",
    pidTidSortingTable(target),
    "MODIFY SETTING shared_merge_tree_disable_merges_and_mutations_assignment = 1",
  );
}

export function buildStopMergesQuery(
  target: ClickhouseDdlTarget = clickhouseDdlTarget(),
): string {
  return joinSql(
    "SYSTEM STOP MERGES",
    onClusterClause(target),
    pidTidSortingTable(target),
  );
}

/**
 * Persists the freeze in table metadata on top of the in-memory action lock so
 * it survives restarts and holds on every replica: stop enqueuing new merges
 * (`max_replicated_merges_in_queue=0`) and stop any replica from executing a
 * merge locally (`always_fetch_merged_part=1`).
 * See https://github.com/ClickHouse/ClickHouse/issues/22830.
 */
export function buildFreezeReplicatedMergesQuery(
  target: ClickhouseDdlTarget = clickhouseDdlTarget(),
): string {
  return joinSql(
    "ALTER TABLE",
    pidTidSortingTable(target),
    onClusterClause(target),
    "MODIFY SETTING max_replicated_merges_in_queue = 0, always_fetch_merged_part = 1",
  );
}

export function buildSyncReplicaQuery(
  target: ClickhouseDdlTarget = clickhouseDdlTarget(),
): string {
  return joinSql(
    "SYSTEM SYNC REPLICA",
    onClusterClause(target),
    pidTidSortingTable(target),
    "STRICT",
  );
}

// ============================================================================
// Cleanup (M5)
// ============================================================================

/**
 * `IF EXISTS` keeps the migration idempotent — re-running the row (or running
 * it on a deployment that never created the scratch table) is a no-op rather
 * than an error.
 */
export function buildDropScratchTableQuery(
  table: string,
  target: ClickhouseDdlTarget = clickhouseDdlTarget(),
): string {
  return joinSql(
    "DROP TABLE IF EXISTS",
    qualifiedClickhouseTableName(target.database, table),
    onClusterClause(target),
    "SYNC",
  );
}
