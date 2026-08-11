import { describe, expect, it } from "vitest";

import {
  buildSystemPartsSource,
  getBackgroundMigrationSourceTable,
} from "./backfillBase";

describe("sharded background migration discovery", () => {
  it("reads one replica per shard instead of only the coordinator", () => {
    expect(buildSystemPartsSource(true, "default")).toBe(
      "cluster('default', 'system.parts')",
    );
  });

  it("uses local source tables for physical part discovery", () => {
    expect(getBackgroundMigrationSourceTable("traces", true)).toBe(
      "traces_local",
    );
    expect(getBackgroundMigrationSourceTable("traces", false)).toBe("traces");
  });
});
