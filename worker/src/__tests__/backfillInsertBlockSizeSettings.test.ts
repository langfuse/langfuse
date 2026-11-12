import { describe, expect, it } from "vitest";

import { buildInsertBlockSizeSettings } from "../backgroundMigrations/utils/insertBlockSizeSettings";

describe("v4 backfill INSERT block size settings", () => {
  it("leaves the ClickHouse profile in control when no overrides are set", () => {
    expect(buildInsertBlockSizeSettings(undefined, undefined)).toBe("");
  });

  it("applies both overrides and keeps a zero threshold", () => {
    expect(buildInsertBlockSizeSettings(20_000, 0)).toBe(
      ",\n        min_insert_block_size_rows = 20000,\n        min_insert_block_size_bytes = 0",
    );
  });
});
