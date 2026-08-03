import { env } from "../../env";
import {
  buildClickhouseDeleteTarget,
  buildClickhouseMutationTable,
} from "./mutationRouting";
import type { ClickhouseShardedTable } from "./shardingContract";

export const getClickhouseDeleteTarget = (
  table: ClickhouseShardedTable,
): string =>
  buildClickhouseDeleteTarget(table, {
    shardingEnabled: env.CLICKHOUSE_SHARDING_ENABLED === "true",
    clusterName: env.CLICKHOUSE_CLUSTER_NAME,
  });

export const getClickhouseMutationTable = (
  table: ClickhouseShardedTable,
): string =>
  buildClickhouseMutationTable(
    table,
    env.CLICKHOUSE_SHARDING_ENABLED === "true",
  );
