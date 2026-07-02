import { describe, expect, it } from "vitest";

import {
  ENRICHED_BLOB_EXPORT_SOURCES,
  isEnrichedBlobExportSource,
  LEGACY_BLOB_EXPORT_SOURCES,
} from "./blob-export-gate";

describe("blob export source gates", () => {
  it("pins the legacy export sources", () => {
    expect(LEGACY_BLOB_EXPORT_SOURCES).toEqual([
      "TRACES_OBSERVATIONS",
      "TRACES_OBSERVATIONS_EVENTS",
    ]);
  });

  it("pins the enriched export sources", () => {
    expect(ENRICHED_BLOB_EXPORT_SOURCES).toEqual([
      "EVENTS",
      "TRACES_OBSERVATIONS_EVENTS",
    ]);
  });

  it("detects enriched export sources", () => {
    expect(isEnrichedBlobExportSource("EVENTS")).toBe(true);
    expect(isEnrichedBlobExportSource("TRACES_OBSERVATIONS_EVENTS")).toBe(true);
    expect(isEnrichedBlobExportSource("TRACES_OBSERVATIONS")).toBe(false);
    expect(isEnrichedBlobExportSource(null)).toBe(false);
  });
});
