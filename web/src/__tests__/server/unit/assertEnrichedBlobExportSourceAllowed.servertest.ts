import { describe, it, expect } from "vitest";
import { assertEnrichedBlobExportSourceAllowed } from "@/src/features/blobstorage-integration/server/assertEnrichedBlobExportSourceAllowed";

describe("assertEnrichedBlobExportSourceAllowed", () => {
  it("Cloud + explicit EVENTS → allow", () => {
    expect(() =>
      assertEnrichedBlobExportSourceAllowed({
        nextInternalExportSource: "EVENTS",
        isCloud: true,
        isV4PreviewEnabled: false,
      }),
    ).not.toThrow();
  });

  it("self-hosted + V4 preview + explicit EVENTS → allow", () => {
    expect(() =>
      assertEnrichedBlobExportSourceAllowed({
        nextInternalExportSource: "EVENTS",
        isCloud: false,
        isV4PreviewEnabled: true,
      }),
    ).not.toThrow();
  });

  it("self-hosted without V4 preview + explicit EVENTS → reject", () => {
    expect(() =>
      assertEnrichedBlobExportSourceAllowed({
        nextInternalExportSource: "EVENTS",
        isCloud: false,
        isV4PreviewEnabled: false,
      }),
    ).toThrow("Enriched blob export is not available on this deployment");
  });

  it("self-hosted without V4 preview + explicit TRACES_OBSERVATIONS_EVENTS → reject", () => {
    expect(() =>
      assertEnrichedBlobExportSourceAllowed({
        nextInternalExportSource: "TRACES_OBSERVATIONS_EVENTS",
        isCloud: false,
        isV4PreviewEnabled: false,
      }),
    ).toThrow("Enriched blob export is not available on this deployment");
  });

  it("self-hosted without V4 preview + explicit TRACES_OBSERVATIONS → allow", () => {
    expect(() =>
      assertEnrichedBlobExportSourceAllowed({
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: false,
        isV4PreviewEnabled: false,
      }),
    ).not.toThrow();
  });

  // Partial updates: the request omits exportSource, so the persisted value
  // stays in effect and must satisfy the gate too (V4-preview rollback case).
  it("self-hosted without V4 preview + omitted source + existing EVENTS → reject", () => {
    expect(() =>
      assertEnrichedBlobExportSourceAllowed({
        nextInternalExportSource: undefined,
        existingExportSource: "EVENTS",
        isCloud: false,
        isV4PreviewEnabled: false,
      }),
    ).toThrow("Enriched blob export is not available on this deployment");
  });

  it("self-hosted without V4 preview + omitted source + existing TRACES_OBSERVATIONS_EVENTS → reject", () => {
    expect(() =>
      assertEnrichedBlobExportSourceAllowed({
        nextInternalExportSource: undefined,
        existingExportSource: "TRACES_OBSERVATIONS_EVENTS",
        isCloud: false,
        isV4PreviewEnabled: false,
      }),
    ).toThrow("Enriched blob export is not available on this deployment");
  });

  it("self-hosted without V4 preview + omitted source + existing TRACES_OBSERVATIONS → allow", () => {
    expect(() =>
      assertEnrichedBlobExportSourceAllowed({
        nextInternalExportSource: undefined,
        existingExportSource: "TRACES_OBSERVATIONS",
        isCloud: false,
        isV4PreviewEnabled: false,
      }),
    ).not.toThrow();
  });

  it("self-hosted without V4 preview + omitted source + no existing row → allow", () => {
    expect(() =>
      assertEnrichedBlobExportSourceAllowed({
        nextInternalExportSource: undefined,
        existingExportSource: null,
        isCloud: false,
        isV4PreviewEnabled: false,
      }),
    ).not.toThrow();
  });

  it("Cloud + omitted source + existing EVENTS → allow", () => {
    expect(() =>
      assertEnrichedBlobExportSourceAllowed({
        nextInternalExportSource: undefined,
        existingExportSource: "EVENTS",
        isCloud: true,
        isV4PreviewEnabled: false,
      }),
    ).not.toThrow();
  });

  it("explicit legacy source overrides an existing enriched value → allow", () => {
    expect(() =>
      assertEnrichedBlobExportSourceAllowed({
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        existingExportSource: "EVENTS",
        isCloud: false,
        isV4PreviewEnabled: false,
      }),
    ).not.toThrow();
  });
});
