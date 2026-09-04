import { describe, expect, it } from "vitest";
import { clampExportStartDateToProjectCreatedAt } from "@/src/features/blobstorage-integration/validation";

describe("clampExportStartDateToProjectCreatedAt", () => {
  const projectCreatedAt = new Date("2024-06-01T12:00:00.000Z");

  it("returns null when no start date is provided", () => {
    expect(
      clampExportStartDateToProjectCreatedAt(null, projectCreatedAt),
    ).toBeNull();
  });

  it("preserves a start date on or after project createdAt", () => {
    const start = new Date("2025-01-01T00:00:00.000Z");
    expect(
      clampExportStartDateToProjectCreatedAt(start, projectCreatedAt),
    ).toEqual(start);
  });

  it("floors a start date older than project createdAt", () => {
    expect(
      clampExportStartDateToProjectCreatedAt(
        new Date("1970-01-01T00:00:00.000Z"),
        projectCreatedAt,
      ),
    ).toEqual(projectCreatedAt);
  });
});
