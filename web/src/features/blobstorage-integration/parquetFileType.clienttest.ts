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

  it("returns true for every whitelisted project id", () => {
    for (const projectId of PARQUET_FILE_TYPE_PROJECT_IDS) {
      expect(isParquetFileTypeAllowed(projectId)).toBe(true);
    }
  });
});
