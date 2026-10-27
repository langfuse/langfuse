import { describe, expect, it } from "vitest";

import {
  COLUMN_DATA_TYPES,
  TABLE_BIND_TYPES,
  DEDUP_SPECS,
  TENANTED_TABLES,
} from "./schema";

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
