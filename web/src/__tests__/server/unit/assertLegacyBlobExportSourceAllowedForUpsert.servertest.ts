import { describe, it, expect } from "vitest";
import { assertLegacyBlobExportSourceAllowedForUpsert } from "@/src/features/blobstorage-integration/server/assertLegacyBlobExportSourceAllowedForUpsert";
import {
  LEGACY_BLOB_EXPORT_CUTOFF,
  LEGACY_BLOB_EXPORTER_CUTOFF,
} from "@langfuse/shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Project-level cutoff (post-cutoff Cloud projects are forced to EVENTS).
const PROJECT_PRE_CUTOFF = new Date(
  LEGACY_BLOB_EXPORT_CUTOFF.getTime() - MS_PER_DAY,
);
const PROJECT_POST_CUTOFF = new Date(
  LEGACY_BLOB_EXPORT_CUTOFF.getTime() + MS_PER_DAY,
);

// Integration-level cutoff (rows created on/after this cannot keep legacy sources).
const INTEGRATION_PRE_CUTOFF = new Date(
  LEGACY_BLOB_EXPORTER_CUTOFF.getTime() - MS_PER_DAY,
);
const INTEGRATION_AT_CUTOFF = LEGACY_BLOB_EXPORTER_CUTOFF;

describe("assertLegacyBlobExportSourceAllowedForUpsert", () => {
  it("Cloud + pre-cutoff project + no row + legacy → throws", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowedForUpsert({
        project: { createdAt: PROJECT_PRE_CUTOFF },
        existingIntegration: null,
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: true,
      }),
    ).toThrow();
  });

  it("Cloud + pre-cutoff project + row (createdAt < CUTOFF) + legacy → allows", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowedForUpsert({
        project: { createdAt: PROJECT_PRE_CUTOFF },
        existingIntegration: { createdAt: INTEGRATION_PRE_CUTOFF },
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: true,
      }),
    ).not.toThrow();
  });

  it("Cloud + post-cutoff project + no row + legacy → throws (delegate)", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowedForUpsert({
        project: { createdAt: PROJECT_POST_CUTOFF },
        existingIntegration: null,
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: true,
      }),
    ).toThrow();
  });

  it("Cloud + post-cutoff project + row (createdAt < CUTOFF) + legacy → throws (delegate wins)", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowedForUpsert({
        project: { createdAt: PROJECT_POST_CUTOFF },
        existingIntegration: { createdAt: INTEGRATION_PRE_CUTOFF },
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: true,
      }),
    ).toThrow();
  });

  it("Cloud + any + EVENTS → allows", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowedForUpsert({
        project: { createdAt: PROJECT_POST_CUTOFF },
        existingIntegration: null,
        nextInternalExportSource: "EVENTS",
        isCloud: true,
      }),
    ).not.toThrow();
  });

  it("self-hosted + post-cutoff project + no row + legacy → allows (short-circuit)", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowedForUpsert({
        project: { createdAt: PROJECT_POST_CUTOFF },
        existingIntegration: null,
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: false,
      }),
    ).not.toThrow();
  });

  it("Cloud + pre-cutoff project + no row + TRACES_OBSERVATIONS_EVENTS → throws", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowedForUpsert({
        project: { createdAt: PROJECT_PRE_CUTOFF },
        existingIntegration: null,
        nextInternalExportSource: "TRACES_OBSERVATIONS_EVENTS",
        isCloud: true,
      }),
    ).toThrow();
  });

  it("Cloud + pre-cutoff project + row (createdAt >= CUTOFF, reset-recreated) + legacy → throws", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowedForUpsert({
        project: { createdAt: PROJECT_PRE_CUTOFF },
        existingIntegration: { createdAt: INTEGRATION_AT_CUTOFF },
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: true,
      }),
    ).toThrow();
  });
});
