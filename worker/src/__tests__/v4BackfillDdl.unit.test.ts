import { describe, expect, it } from "vitest";
import {
  PID_TID_SORTING_TABLE,
  buildDisableSharedMergeTreeMergesQuery,
  buildDropScratchTableQuery,
  buildFreezeReplicatedMergesQuery,
  buildStopMergesQuery,
  buildSyncReplicaQuery,
  onClusterClause,
  pidTidSortingTable,
} from "../backgroundMigrations/utils/v4BackfillDdl";

/**
 * Regression coverage for #15845: the V4 historic backfill emitted unqualified
 * `SYSTEM STOP MERGES` / `SYSTEM SYNC REPLICA`. ClickHouse's
 * `AddDefaultDatabaseVisitor` only qualifies `ASTAlterQuery`,
 * `ASTQueryWithTableAndOutput` and `ASTRenameQuery` with the initiator's
 * database — `ASTSystemQuery` is never visited, so each host's DDL worker
 * resolved the scratch table against its own `default` database and the chain
 * failed with `Table default.observations_pid_tid_sorting does not exist`.
 *
 * Every statement below must therefore name the configured database, and the
 * `ON CLUSTER` statements are the ones that actually regress.
 */
const NON_DEFAULT = {
  database: "langfuse",
  clusterEnabled: true,
  clusterName: "default",
};

describe("V4 backfill DDL", () => {
  it("qualifies the ON CLUSTER SYSTEM commands with the configured database", () => {
    expect(buildStopMergesQuery(NON_DEFAULT)).toBe(
      "SYSTEM STOP MERGES ON CLUSTER `default` `langfuse`.`observations_pid_tid_sorting`",
    );
    expect(buildSyncReplicaQuery(NON_DEFAULT)).toBe(
      "SYSTEM SYNC REPLICA ON CLUSTER `default` `langfuse`.`observations_pid_tid_sorting` STRICT",
    );
  });

  it("qualifies the merge-freeze and cleanup statements", () => {
    expect(buildFreezeReplicatedMergesQuery(NON_DEFAULT)).toBe(
      "ALTER TABLE `langfuse`.`observations_pid_tid_sorting` ON CLUSTER `default` " +
        "MODIFY SETTING max_replicated_merges_in_queue = 0, always_fetch_merged_part = 1",
    );
    expect(buildDisableSharedMergeTreeMergesQuery(NON_DEFAULT)).toBe(
      "ALTER TABLE `langfuse`.`observations_pid_tid_sorting` " +
        "MODIFY SETTING shared_merge_tree_disable_merges_and_mutations_assignment = 1",
    );
    expect(buildDropScratchTableQuery(PID_TID_SORTING_TABLE, NON_DEFAULT)).toBe(
      "DROP TABLE IF EXISTS `langfuse`.`observations_pid_tid_sorting` ON CLUSTER `default` SYNC",
    );
  });

  it("omits ON CLUSTER on single-node deployments without leaving double spaces", () => {
    const singleNode = {
      database: "langfuse",
      clusterEnabled: false,
      clusterName: "default",
    };

    expect(buildStopMergesQuery(singleNode)).toBe(
      "SYSTEM STOP MERGES `langfuse`.`observations_pid_tid_sorting`",
    );
    expect(buildDropScratchTableQuery(PID_TID_SORTING_TABLE, singleNode)).toBe(
      "DROP TABLE IF EXISTS `langfuse`.`observations_pid_tid_sorting` SYNC",
    );
    expect(onClusterClause(singleNode)).toBe("");
  });

  it("quotes cluster and database names that are not bare identifiers", () => {
    expect(
      buildStopMergesQuery({
        database: "langfuse-prod",
        clusterEnabled: true,
        clusterName: "prod-cluster",
      }),
    ).toBe(
      "SYSTEM STOP MERGES ON CLUSTER `prod-cluster` `langfuse-prod`.`observations_pid_tid_sorting`",
    );
  });

  it("escapes backticks in configured identifiers", () => {
    expect(pidTidSortingTable({ ...NON_DEFAULT, database: "lang`fuse" })).toBe(
      "`lang\\`fuse`.`observations_pid_tid_sorting`",
    );
  });

  it("rejects empty identifiers rather than emitting an unqualified statement", () => {
    expect(() =>
      buildStopMergesQuery({ ...NON_DEFAULT, database: "" }),
    ).toThrow("Invalid ClickHouse database");
    expect(() =>
      buildStopMergesQuery({ ...NON_DEFAULT, clusterName: "" }),
    ).toThrow("Invalid ClickHouse cluster");
  });
});
