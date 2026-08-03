import { env } from "../../env";
import { logger } from "../logger";
import { clickhouseClient, clickhouseClientForUrl } from "./client";
import {
  CLICKHOUSE_ROUTING_VERSION,
  CLICKHOUSE_SHARDED_TABLES,
  CLICKHOUSE_SHARDING_SCHEMA_VERSION,
  CLICKHOUSE_SHARDING_CONTRACT_COMMENT,
} from "./shardingContract";

export interface ClusterNode {
  host: string;
  port: number;
  protocol: "http" | "https";
}

export interface ShardTopology {
  shardNum: number;
  weight: number;
  internalReplication: boolean;
  replicas: ClusterNode[];
}

export interface ClusterTopology {
  clusterName: string;
  shards: ShardTopology[];
  fingerprint: string;
  fetchedAt: number;
}

export interface SystemClustersRow {
  shard_num: number;
  replica_num: number;
  host_name: string;
  host_address: string;
  shard_weight: number;
  internal_replication: number;
}

export interface SystemTablesRow {
  name: string;
  engine: string;
  engine_full: string;
  comment: string;
}

const SHARDED_TABLE_NAMES = Object.keys(CLICKHOUSE_SHARDED_TABLES);

export type ClusterTopologyContractStatus =
  | "uninitialized"
  | "valid"
  | "unavailable"
  | "invalid"
  | "topology_changed";

export interface ClusterTopologyContractState {
  status: ClusterTopologyContractStatus;
  reason?: string;
  fingerprint?: string;
}

let cachedTopology: ClusterTopology | null = null;
let inflight: Promise<ClusterTopology | null> | null = null;
let lockedFingerprint: string | null = null;
let contractState: ClusterTopologyContractState = {
  status: "uninitialized",
};

const isPositiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value > 0;

const isBareHost = (host: string): boolean =>
  host.length > 0 && !/[/?#@]/.test(host) && !host.includes("://");

export const getClusterNodeUrl = (node: ClusterNode): string => {
  const host = node.host.includes(":") ? `[${node.host}]` : node.host;
  return `${node.protocol}://${host}:${node.port}`;
};

export const hasUnsafeInternalReplication = (
  topology: ClusterTopology,
): boolean => topology.shards.some((shard) => !shard.internalReplication);

export const parseClusterTopologyRows = (
  rows: SystemClustersRow[],
  fetchedAt = Date.now(),
): ClusterTopology | null => {
  if (rows.length === 0) return null;

  const byShard = new Map<
    number,
    ShardTopology & { replicaNums: Set<number> }
  >();

  for (const row of rows) {
    const shardNum = Number(row.shard_num);
    const replicaNum = Number(row.replica_num);
    const weight = Number(row.shard_weight);
    const internalReplication = Number(row.internal_replication);
    const rawHost =
      env.CLICKHOUSE_LOCAL_HOST_FIELD === "host_name"
        ? row.host_name
        : row.host_address;
    const host = typeof rawHost === "string" ? rawHost.trim() : "";

    if (
      !isPositiveInteger(shardNum) ||
      !isPositiveInteger(replicaNum) ||
      !isPositiveInteger(weight) ||
      (internalReplication !== 0 && internalReplication !== 1) ||
      !isBareHost(host)
    ) {
      return null;
    }

    const existing = byShard.get(shardNum);
    if (existing) {
      if (
        existing.weight !== weight ||
        existing.internalReplication !== (internalReplication === 1) ||
        existing.replicaNums.has(replicaNum)
      ) {
        return null;
      }
      existing.replicaNums.add(replicaNum);
      existing.replicas.push({
        host,
        port: env.CLICKHOUSE_LOCAL_HTTP_PORT,
        protocol: env.CLICKHOUSE_LOCAL_HTTP_PROTOCOL,
      });
      continue;
    }

    byShard.set(shardNum, {
      shardNum,
      weight,
      internalReplication: internalReplication === 1,
      replicas: [
        {
          host,
          port: env.CLICKHOUSE_LOCAL_HTTP_PORT,
          protocol: env.CLICKHOUSE_LOCAL_HTTP_PROTOCOL,
        },
      ],
      replicaNums: new Set([replicaNum]),
    });
  }

  const parsed = [...byShard.values()].sort(
    (left, right) => left.shardNum - right.shardNum,
  );
  for (let shardIndex = 0; shardIndex < parsed.length; shardIndex++) {
    const shard = parsed[shardIndex];
    if (shard.shardNum !== shardIndex + 1) return null;
    const replicaNums = [...shard.replicaNums].sort((a, b) => a - b);
    if (replicaNums.some((replicaNum, index) => replicaNum !== index + 1)) {
      return null;
    }
  }

  const shards: ShardTopology[] = parsed.map(
    ({ replicaNums: _replicaNums, ...shard }) => shard,
  );
  const fingerprint = JSON.stringify({
    schemaVersion: CLICKHOUSE_SHARDING_SCHEMA_VERSION,
    routingVersion: CLICKHOUSE_ROUTING_VERSION,
    clusterName: env.CLICKHOUSE_CLUSTER_NAME,
    database: env.CLICKHOUSE_DB,
    shards: shards.map((shard) => ({
      shardNum: shard.shardNum,
      weight: shard.weight,
      internalReplication: shard.internalReplication,
      replicas: shard.replicas.map(getClusterNodeUrl),
    })),
  });

  return {
    clusterName: env.CLICKHOUSE_CLUSTER_NAME,
    shards,
    fingerprint,
    fetchedAt,
  };
};

const normalizeEngineDefinition = (value: string): string =>
  value.replace(/[\s'`]/g, "").toLowerCase();

export const hasValidLocalWriteTableContract = (
  rows: SystemTablesRow[],
): boolean => {
  const byName = new Map(rows.map((row) => [row.name, row]));
  if (byName.size !== SHARDED_TABLE_NAMES.length * 2) {
    return false;
  }

  for (const [table, contract] of Object.entries(CLICKHOUSE_SHARDED_TABLES)) {
    const logical = byName.get(table);
    const local = byName.get(`${table}_local`);
    if (!logical || logical.engine !== "Distributed" || !local) return false;
    if (
      logical.comment !== CLICKHOUSE_SHARDING_CONTRACT_COMMENT ||
      local.comment !== CLICKHOUSE_SHARDING_CONTRACT_COMMENT
    ) {
      return false;
    }

    const expectedDistributedPrefixes = [
      env.CLICKHOUSE_DB,
      "currentDatabase()",
    ].map((database) =>
      normalizeEngineDefinition(
        `Distributed(${env.CLICKHOUSE_CLUSTER_NAME},${database},${table}_local,${contract.shardingExpression}`,
      ),
    );
    const normalizedEngine = normalizeEngineDefinition(logical.engine_full);
    if (
      !expectedDistributedPrefixes.some(
        (prefix) =>
          normalizedEngine === `${prefix})` ||
          normalizedEngine.startsWith(`${prefix},`),
      )
    ) {
      return false;
    }
    if (local.engine !== contract.localEngine) {
      return false;
    }
    const normalizedLocalEngine = normalizeEngineDefinition(local.engine_full);
    if (
      !normalizedLocalEngine.startsWith(
        `${contract.localEngine.toLowerCase()}(`,
      ) ||
      !normalizedLocalEngine.includes("{shard}") ||
      !normalizedLocalEngine.includes("{replica}")
    ) {
      return false;
    }
  }
  return true;
};

const setFatalContractState = (
  status: "invalid" | "topology_changed",
  reason: string,
): null => {
  cachedTopology = null;
  contractState = {
    status,
    reason,
    fingerprint: lockedFingerprint ?? undefined,
  };
  return null;
};

const validateLocalWriteTableContract = async (
  topology: ClusterTopology,
): Promise<boolean> => {
  const tableNames = SHARDED_TABLE_NAMES.flatMap((table) => [
    `'${table}'`,
    `'${table}_local'`,
  ]).join(",\n              ");
  const nodes = topology.shards.flatMap((shard) => shard.replicas);
  const results = await Promise.all(
    nodes.map(async (node) => {
      const resultSet = await clickhouseClientForUrl(
        getClusterNodeUrl(node),
      ).query({
        query: `
          SELECT name, engine, engine_full, comment
          FROM system.tables
          WHERE database = currentDatabase()
            AND name IN (
              ${tableNames}
            )
          ORDER BY name
        `,
        format: "JSONEachRow",
      });
      return hasValidLocalWriteTableContract(
        await resultSet.json<SystemTablesRow>(),
      );
    }),
  );
  return results.every(Boolean);
};

const discoverTopology = async (): Promise<ClusterTopology | null> => {
  if (
    contractState.status === "invalid" ||
    contractState.status === "topology_changed"
  ) {
    return null;
  }
  try {
    const resultSet = await clickhouseClient().query({
      query: `
        SELECT
          shard_num,
          replica_num,
          host_name,
          host_address,
          shard_weight,
          internal_replication
        FROM system.clusters
        WHERE cluster = {cluster:String}
        ORDER BY shard_num, replica_num
      `,
      query_params: { cluster: env.CLICKHOUSE_CLUSTER_NAME },
      format: "JSONEachRow",
    });
    const topology = parseClusterTopologyRows(
      await resultSet.json<SystemClustersRow>(),
    );
    if (!topology) {
      logger.warn(
        `[ClusterTopology] Refusing incomplete or invalid topology for '${env.CLICKHOUSE_CLUSTER_NAME}'`,
      );
      return setFatalContractState("invalid", "invalid_cluster_topology");
    }
    if (hasUnsafeInternalReplication(topology)) {
      logger.warn(
        "[ClusterTopology] Replicated shards require internal_replication=true",
      );
      return setFatalContractState("invalid", "unsafe_internal_replication");
    }
    if (!(await validateLocalWriteTableContract(topology))) {
      logger.warn(
        "[ClusterTopology] Local write table contract does not match the configured cluster",
      );
      return setFatalContractState("invalid", "invalid_table_contract");
    }
    if (lockedFingerprint && lockedFingerprint !== topology.fingerprint) {
      logger.error(
        "[ClusterTopology] Refusing topology change while sharded writes are active",
      );
      return setFatalContractState(
        "topology_changed",
        "topology_fingerprint_changed",
      );
    }

    lockedFingerprint = topology.fingerprint;
    cachedTopology = topology;
    contractState = {
      status: "valid",
      fingerprint: topology.fingerprint,
    };
    return topology;
  } catch (error) {
    cachedTopology = null;
    contractState = {
      status: "unavailable",
      reason: "topology_discovery_failed",
      fingerprint: lockedFingerprint ?? undefined,
    };
    logger.error(
      "[ClusterTopology] Failed to discover cluster topology",
      error,
    );
    return null;
  }
};

const isFresh = (
  topology: ClusterTopology | null,
): topology is ClusterTopology =>
  topology !== null &&
  Date.now() - topology.fetchedAt < env.CLICKHOUSE_LOCAL_TOPOLOGY_TTL_MS;

export const getClusterTopology = async ({
  forceRefresh = false,
}: { forceRefresh?: boolean } = {}): Promise<ClusterTopology | null> => {
  if (!forceRefresh && isFresh(cachedTopology)) return cachedTopology;

  if (!inflight) {
    inflight = discoverTopology().finally(() => {
      inflight = null;
    });
  }
  return inflight;
};

export const getCachedClusterTopology = (): ClusterTopology | null =>
  isFresh(cachedTopology) ? cachedTopology : null;

export const getClusterTopologyContractState =
  (): ClusterTopologyContractState => ({ ...contractState });

export const initializeClickhouseShardingContract = async (): Promise<void> => {
  if (env.CLICKHOUSE_SHARDING_ENABLED !== "true") return;
  if (await getClusterTopology({ forceRefresh: true })) return;
  const state = getClusterTopologyContractState();
  throw new Error(
    `ClickHouse sharding startup validation failed: ${state.reason ?? state.status}`,
  );
};

export const __resetClusterTopologyCacheForTests = (): void => {
  cachedTopology = null;
  inflight = null;
  lockedFingerprint = null;
  contractState = { status: "uninitialized" };
};

export const __setClusterTopologyForTests = (
  topology: ClusterTopology,
): void => {
  cachedTopology = topology;
  inflight = null;
  lockedFingerprint = topology.fingerprint;
  contractState = { status: "valid", fingerprint: topology.fingerprint };
};
