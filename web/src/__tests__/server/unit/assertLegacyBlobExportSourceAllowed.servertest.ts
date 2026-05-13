import { describe, it, expect } from "vitest";
import { assertLegacyBlobExportSourceAllowed } from "@/src/features/blobstorage-integration/server/assertLegacyBlobExportSourceAllowed";

const PRE_CUTOFF = new Date("2026-05-19T23:59:59.999Z");
const AT_CUTOFF = new Date("2026-05-20T00:00:00.000Z");
const POST_CUTOFF = new Date("2026-05-21T00:00:00.000Z");

describe("assertLegacyBlobExportSourceAllowed", () => {
  it("Cloud + EVENTS + pre-cutoff → allow", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowed({
        project: { createdAt: PRE_CUTOFF },
        nextInternalExportSource: "EVENTS",
        isCloud: true,
      }),
    ).not.toThrow();
  });

  it("Cloud + EVENTS + post-cutoff → allow", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowed({
        project: { createdAt: POST_CUTOFF },
        nextInternalExportSource: "EVENTS",
        isCloud: true,
      }),
    ).not.toThrow();
  });

  it("Cloud + TRACES_OBSERVATIONS + pre-cutoff → allow (grandfathered)", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowed({
        project: { createdAt: PRE_CUTOFF },
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: true,
      }),
    ).not.toThrow();
  });

  it("Cloud + TRACES_OBSERVATIONS + post-cutoff → reject", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowed({
        project: { createdAt: POST_CUTOFF },
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: true,
      }),
    ).toThrow();
  });

  it("Cloud + TRACES_OBSERVATIONS_EVENTS + post-cutoff → reject", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowed({
        project: { createdAt: POST_CUTOFF },
        nextInternalExportSource: "TRACES_OBSERVATIONS_EVENTS",
        isCloud: true,
      }),
    ).toThrow();
  });

  it("self-hosted + EVENTS + post-cutoff → allow (bypass)", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowed({
        project: { createdAt: POST_CUTOFF },
        nextInternalExportSource: "EVENTS",
        isCloud: false,
      }),
    ).not.toThrow();
  });

  it("self-hosted + TRACES_OBSERVATIONS + pre-cutoff → allow (bypass)", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowed({
        project: { createdAt: PRE_CUTOFF },
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: false,
      }),
    ).not.toThrow();
  });

  it("self-hosted + TRACES_OBSERVATIONS + post-cutoff → allow (bypass)", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowed({
        project: { createdAt: POST_CUTOFF },
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: false,
      }),
    ).not.toThrow();
  });

  it("boundary: project.createdAt === cutoff → reject (>= semantics)", () => {
    expect(() =>
      assertLegacyBlobExportSourceAllowed({
        project: { createdAt: AT_CUTOFF },
        nextInternalExportSource: "TRACES_OBSERVATIONS",
        isCloud: true,
      }),
    ).toThrow();
  });
});
