import { describe, expect, it } from "vitest";

import { COLUMN_DATA_TYPES, TENANTED_TABLES } from "./schema";
import {
  condition7TypeAssertions,
  extensionTypeAssertions,
} from "./types.assert";

describe("table registry derivation", () => {
  it("derives the tenanted table set from the registry", () => {
    // Only relations modeled with `tenant: true` are scoped. `events` /
    // `events_full` are intentionally absent: they are not selectable (not in
    // the row type) and raw sources are rejected, so they were unreachable.
    expect([...TENANTED_TABLES].sort()).toEqual([
      "events_core",
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
  });

  // The assertions themselves are compile-time (`tsc` is the test); this only
  // anchors the file so its `@ts-expect-error` checks stay in the build graph.
  it("keeps the compile-time type assertions in the build graph", () => {
    expect(typeof condition7TypeAssertions).toBe("function");
    expect(typeof extensionTypeAssertions).toBe("function");
  });
});
