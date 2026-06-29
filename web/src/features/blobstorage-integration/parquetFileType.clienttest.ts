import { describe, expect, it } from "vitest";
import {
  PARQUET_FILE_TYPE_PROJECT_IDS,
  isParquetFileTypeAllowed,
} from "@/src/features/blobstorage-integration/parquetFileType";

describe("isParquetFileTypeAllowed", () => {
  it("returns false for a project that is not whitelisted", () => {
    expect(isParquetFileTypeAllowed("not-a-whitelisted-project-id")).toBe(
      false,
    );
  });

  it("reflects membership in PARQUET_FILE_TYPE_PROJECT_IDS", () => {
    // Equivalence check that stays correct and non-vacuous whether the shipped
    // whitelist is empty or populated: the helper must return true exactly for
    // ids in the constant. The appended non-member guarantees at least one real
    // assertion runs (so the test can't pass vacuously while the list is empty)
    // and would catch a regression to `return true`; every entry actually in
    // the list (once populated) guards against `return false`.
    for (const id of [...PARQUET_FILE_TYPE_PROJECT_IDS, "not-in-the-list"]) {
      expect(isParquetFileTypeAllowed(id)).toBe(
        PARQUET_FILE_TYPE_PROJECT_IDS.includes(id),
      );
    }
  });
});
