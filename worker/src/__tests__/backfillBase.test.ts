import { describe, expect, it } from "vitest";
import { qualifiedClickhouseTableName } from "../backgroundMigrations/utils/clickhouseIdentifiers";

describe("qualifiedClickhouseTableName", () => {
  it("qualifies table names with the configured ClickHouse database", () => {
    expect(
      qualifiedClickhouseTableName("langfuse", "observations_pid_tid_sorting"),
    ).toBe("`langfuse`.`observations_pid_tid_sorting`");
  });

  it("escapes backticks in configured identifiers", () => {
    expect(qualifiedClickhouseTableName("lang`fuse", "scratch`table")).toBe(
      "`lang\\`fuse`.`scratch\\`table`",
    );
  });
});
