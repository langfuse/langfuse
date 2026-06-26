/**
 * Topology-aware ClickHouse helpers shared by the CI E2E spec (single-node) and
 * the manual Cloud / replicated-OSS runner. They branch ONLY on the engine
 * prefix reported by the production `detectTableEngine()` so the same oracle
 * code runs unchanged across all three deployments:
 *
 *   - ""/MergeTree-family  → single-node OSS
 *   - "Replicated*"        → replicated OSS (Keeper-backed)
 *   - "Shared*"            → ClickHouse Cloud
 *
 * See specs/v4-historic-backfill-migration-testing.md (§5, §9).
 */
import {
  clickhouseClient,
  commandClickhouse,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { env } from "../../../../env";
import { detectTableEngine } from "../../../utils/backfillBase";

export type TopologyKind = "single-node" | "replicated" | "cloud";

const tags = (operation: string) => ({
  surface: "worker" as const,
  route: `bg-migration-test.${operation}`,
});

/** Classifies a table's deployment topology from its engine prefix. */
export function topologyKindFromEngine(engine: string): TopologyKind {
  if (engine.startsWith("Shared")) return "cloud";
  if (engine.startsWith("Replicated")) return "replicated";
  return "single-node";
}

/** Engine ClickHouse actually picked for a table ("" if it does not exist). */
export async function getEngine(table: string): Promise<string> {
  return detectTableEngine(table);
}

export async function getTopologyKind(table: string): Promise<TopologyKind> {
  return topologyKindFromEngine(await getEngine(table));
}

/** True only if every requested table currently exists. */
export async function tablesExist(names: string[]): Promise<boolean> {
  const res = await clickhouseClient().query({ query: "SHOW TABLES" });
  const present = new Set(
    ((await res.json()).data as { name: string }[]).map((r) => r.name),
  );
  return names.every((n) => present.has(n));
}

export async function tableExists(name: string): Promise<boolean> {
  return tablesExist([name]);
}

/**
 * Topology-aware table existence: on a cluster, checks every replica via
 * `clusterAllReplicas`. Single-node falls back to a local `system.tables` read.
 */
export async function tableExistsAllReplicas(table: string): Promise<boolean> {
  if (env.CLICKHOUSE_CLUSTER_ENABLED === "true") {
    const rows = await queryClickhouse<{ c: string }>({
      query: `
        SELECT count() AS c
        FROM clusterAllReplicas('${env.CLICKHOUSE_CLUSTER_NAME}', 'system.tables')
        WHERE database = currentDatabase() AND name = {table: String}
      `,
      params: { table },
      clickhouseSettings: { skip_unavailable_shards: 1 },
      tags: tags("tableExistsAllReplicas"),
    });
    return Number(rows[0]?.c ?? 0) > 0;
  }
  return tableExists(table);
}

export async function getOrderByClause(table: string): Promise<string> {
  const rows = await queryClickhouse<{ sorting_key: string }>({
    query: `
      SELECT sorting_key
      FROM system.tables
      WHERE database = currentDatabase() AND name = {table: String}
    `,
    params: { table },
    tags: tags("getOrderByClause"),
  });
  return rows[0]?.sorting_key ?? "";
}

/**
 * Project-scoped, FINAL-read row count. `events_full` and the scratch table are
 * ReplacingMergeTree, so FINAL collapses unmerged duplicates to the latest
 * version — without it counts are non-deterministic between merges.
 */
export async function countFinal(
  table: string,
  projectId: string,
  extraWhere?: string,
): Promise<number> {
  const clause = extraWhere ? ` AND (${extraWhere})` : "";
  const rows = await queryClickhouse<{ c: string }>({
    query: `
      SELECT count() AS c
      FROM ${table} FINAL
      WHERE project_id = {projectId: String}${clause}
    `,
    params: { projectId },
    tags: tags("countFinal"),
  });
  return Number(rows[0]?.c ?? 0);
}

/** Project-scoped, FINAL-read rows for shape/field assertions. */
export async function selectFinal<T>(
  table: string,
  projectId: string,
  columns: string,
  extraWhere?: string,
): Promise<T[]> {
  const clause = extraWhere ? ` AND (${extraWhere})` : "";
  return queryClickhouse<T>({
    query: `
      SELECT ${columns}
      FROM ${table} FINAL
      WHERE project_id = {projectId: String}${clause}
    `,
    params: { projectId },
    tags: tags("selectFinal"),
  });
}

/**
 * Converges a replicated table so a subsequent read sees the full, post-write
 * part set on the queried node. No-op on single-node (nothing to sync) and on
 * Cloud (SharedMergeTree keeps part metadata centrally consistent).
 */
export async function ensureConverged(table: string): Promise<void> {
  const engine = await getEngine(table);
  if (!engine.startsWith("Replicated")) return;
  await commandClickhouse({
    query: `SYSTEM SYNC REPLICA ${onCluster()} ${table} STRICT`,
    tags: tags("ensureConverged"),
  });
}

function onCluster(): string {
  return env.CLICKHOUSE_CLUSTER_ENABLED === "true"
    ? `ON CLUSTER ${env.CLICKHOUSE_CLUSTER_NAME}`
    : "";
}

/**
 * Asserts the scratch table's merge-freeze state for the current topology.
 * Returns a human-readable status. Single-node `SYSTEM STOP MERGES` is an
 * in-memory lock with no durable signal to assert, so we only confirm the table
 * is present there; the replicated/Cloud branches check the persisted settings
 * M2 sets. Used by the manual runner; the CI single-node path treats it as a
 * smoke check.
 */
export async function describeMergeFreeze(table: string): Promise<string> {
  const engine = await getEngine(table);
  const kind = topologyKindFromEngine(engine);

  if (kind === "cloud") {
    const rows = await queryClickhouse<{ value: string }>({
      query: `
        SELECT value
        FROM system.merge_tree_settings
        WHERE name = 'shared_merge_tree_disable_merges_and_mutations_assignment'
      `,
      tags: tags("describeMergeFreeze"),
    });
    return `cloud: shared_merge_tree_disable_merges_and_mutations_assignment=${rows[0]?.value ?? "?"}`;
  }

  if (kind === "replicated") {
    const rows = await queryClickhouse<{
      max_replicated_merges_in_queue: string;
      always_fetch_merged_part: string;
    }>({
      query: `
        SELECT
          anyIf(value, name = 'max_replicated_merges_in_queue') AS max_replicated_merges_in_queue,
          anyIf(value, name = 'always_fetch_merged_part') AS always_fetch_merged_part
        FROM clusterAllReplicas('${env.CLICKHOUSE_CLUSTER_NAME}', 'system.replicated_merge_tree_settings')
      `,
      clickhouseSettings: { skip_unavailable_shards: 1 },
      tags: tags("describeMergeFreeze"),
    });
    return `replicated: max_replicated_merges_in_queue=${rows[0]?.max_replicated_merges_in_queue ?? "?"}, always_fetch_merged_part=${rows[0]?.always_fetch_merged_part ?? "?"}`;
  }

  return `single-node: in-memory STOP MERGES (not durably assertable), engine=${engine || "unknown"}`;
}
