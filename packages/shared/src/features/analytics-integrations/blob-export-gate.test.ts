import { describe, it, expect } from "vitest";
import { AnalyticsIntegrationExportSource } from "@prisma/client";

import {
  isEnrichedBlobExportSource,
  isLegacyBlobExportSource,
} from "./blob-export-gate";

describe("isLegacyBlobExportSource", () => {
  it("is true for the legacy sources", () => {
    expect(
      isLegacyBlobExportSource(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      ),
    ).toBe(true);
    expect(
      isLegacyBlobExportSource(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
      ),
    ).toBe(true);
  });

  it("is false for the enriched-only source and nullish values", () => {
    expect(
      isLegacyBlobExportSource(AnalyticsIntegrationExportSource.EVENTS),
    ).toBe(false);
    expect(isLegacyBlobExportSource(null)).toBe(false);
    expect(isLegacyBlobExportSource(undefined)).toBe(false);
  });

  it("TRACES_OBSERVATIONS_EVENTS counts as both legacy and enriched", () => {
    // It exports the legacy tables *and* the enriched events, so both
    // predicates must return true — this project still needs the warning.
    const source = AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS;
    expect(isLegacyBlobExportSource(source)).toBe(true);
    expect(isEnrichedBlobExportSource(source)).toBe(true);
  });

  it("EVENTS is enriched-only, never legacy", () => {
    const source = AnalyticsIntegrationExportSource.EVENTS;
    expect(isLegacyBlobExportSource(source)).toBe(false);
    expect(isEnrichedBlobExportSource(source)).toBe(true);
  });
});
