import type { ClickhouseShardedTable } from "./shardingContract";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]*$/;

const quoteIdentifier = (value: string, label: string): string => {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Invalid ClickHouse ${label}: ${value}`);
  }
  return `\`${value}\``;
};

export const buildClickhouseMutationTable = (
  table: ClickhouseShardedTable,
  shardingEnabled: boolean,
): string => (shardingEnabled ? `${table}_local` : table);

/**
 * DELETE cannot target a Distributed engine. In sharded mode the mutation is
 * therefore submitted against every shard's replicated local table. ON
 * CLUSTER executes once per replica, while ReplicatedMergeTree deduplicates
 * the identical mutation command within each shard.
 */
export const buildClickhouseDeleteTarget = (
  table: ClickhouseShardedTable,
  config: { shardingEnabled: boolean; clusterName: string },
): string => {
  const target = buildClickhouseMutationTable(table, config.shardingEnabled);
  if (!config.shardingEnabled) return target;
  return `${target} ON CLUSTER ${quoteIdentifier(config.clusterName, "cluster name")}`;
};
