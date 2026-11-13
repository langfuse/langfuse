import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EVENTS_CORE_TRUNCATION_LIMIT } from "../queries/clickhouse-sql/events-core-truncation";
import {
  COLUMN_DATA_TYPES,
  EVENTS_CORE_TRUNCATIONS,
  TABLE_BIND_TYPES,
  DEDUP_SPECS,
  TENANTED_TABLES,
} from "./schema";

describe("EVENTS_CORE_TRUNCATIONS", () => {
  // Statements of the canonical up migrations, in migration order.
  const dir = join(__dirname, "../../../clickhouse/migrations/canonical");
  const statements = readdirSync(dir)
    .filter((file) => file.endsWith(".up.sql"))
    .sort()
    .flatMap((file) => readFileSync(join(dir, file), "utf8").split(";"));

  it("matches the cuts of the latest events_core_mv query and the events_core lengths", () => {
    const mvQuery = statements.findLast((s) =>
      /events_core_mv\b[^;]*\b(AS|MODIFY QUERY)\s+SELECT\b/.test(s),
    );
    // `<expr> as <column>` select items: the columns the MV cuts.
    const cuts = Object.fromEntries(
      [...(mvQuery ?? "").matchAll(/^\s*(\S.*?) as (\w+),?$/gim)].map(
        ([, expression, column]) => [column, expression],
      ),
    );
    // `<column> UInt64 MATERIALIZED lengthUTF8(<cut column>)` on events_core.
    const lengths = statements
      .filter((s) =>
        /^\s*(CREATE TABLE|ALTER TABLE)[^;]*\bevents_core\s/.test(s),
      )
      .flatMap((s) => [
        ...s.matchAll(/(\w+) UInt64 MATERIALIZED lengthUTF8\((\w+)\)/g),
      ])
      .filter(([, , of]) => of in cuts)
      .map(([, column, of]) => [column, `lengthUTF8(${cuts[of]})`]);

    const n = EVENTS_CORE_TRUNCATION_LIMIT;
    const cut = {
      text: (column: string) => `leftUTF8(${column}, ${n})`,
      elements: (column: string) =>
        `arrayMap(v -> leftUTF8(v, ${n}), ${column})`,
    };
    const expected = Object.entries(EVENTS_CORE_TRUNCATIONS).map(
      ([column, t]) => [
        column,
        t.cut === "length"
          ? `lengthUTF8(${cut.text(t.of)})`
          : cut[t.cut](column),
      ],
    );
    expect({ ...cuts, ...Object.fromEntries(lengths) }).toEqual(
      Object.fromEntries(expected),
    );
  });
});

describe("table registry derivation", () => {
  it("derives the tenanted table set from the registry", () => {
    expect([...TENANTED_TABLES].sort()).toEqual([
      "events",
      "events_core",
      "events_full",
      "events_truncated",
      "observations",
      "scores",
      "traces",
    ]);
  });

  it("derives coarse runtime column types for the type-check pass", () => {
    expect(COLUMN_DATA_TYPES.total_cost).toBe("number");
    expect(COLUMN_DATA_TYPES.environment).toBe("string");
    expect(COLUMN_DATA_TYPES.timestamp).toBe("date");
    expect(COLUMN_DATA_TYPES.metadata_names).toBe("array");
    expect(COLUMN_DATA_TYPES.cost_details).toBe("map");
    expect(COLUMN_DATA_TYPES.is_deleted).toBe("number");
    expect(COLUMN_DATA_TYPES.metadata).toBe("map");
  });

  it("declares events_core and events_full as immutable and leaves legacy tables undeclared", () => {
    expect(DEDUP_SPECS.events_core).toEqual({ strategy: "none" });
    expect(DEDUP_SPECS.events_full).toEqual({ strategy: "none" });
    expect(DEDUP_SPECS.traces).toBeUndefined();
    expect(DEDUP_SPECS.observations).toBeUndefined();
    expect(DEDUP_SPECS.scores).toBeUndefined();
  });

  it("derives ClickHouse bind types from the same column declarations", () => {
    expect(TABLE_BIND_TYPES.events_core.total_cost).toBe("Decimal(18, 12)");
    expect(TABLE_BIND_TYPES.scores.value).toBe("Float64");
    expect(TABLE_BIND_TYPES.scores.trace_id).toBe("String");
    expect(TABLE_BIND_TYPES.events_core.start_time).toBe("DateTime64(6)");
    expect(TABLE_BIND_TYPES.observations.start_time).toBe("DateTime64(3)");
  });
});
