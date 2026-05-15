import { describe, it, expect } from "vitest";
import { assertLegacyBlobExportSourceAllowed } from "@/src/features/blobstorage-integration/server/assertLegacyBlobExportSourceAllowed";
import {
  isLegacyBlobExportAllowed,
  LEGACY_BLOB_EXPORT_CUTOFF,
} from "@langfuse/shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PRE_CUTOFF = new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() - MS_PER_DAY);
const AT_CUTOFF = LEGACY_BLOB_EXPORT_CUTOFF;
const POST_CUTOFF = new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() + MS_PER_DAY);

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

describe("isLegacyBlobExportAllowed predicate", () => {
  it("self-hosted always returns true", () => {
    expect(isLegacyBlobExportAllowed(POST_CUTOFF, false)).toBe(true);
    expect(isLegacyBlobExportAllowed(AT_CUTOFF, false)).toBe(true);
    expect(isLegacyBlobExportAllowed(PRE_CUTOFF, false)).toBe(true);
  });

  it("Cloud + pre-cutoff → true (grandfathered)", () => {
    expect(isLegacyBlobExportAllowed(PRE_CUTOFF, true)).toBe(true);
  });

  it("Cloud + post-cutoff → false", () => {
    expect(isLegacyBlobExportAllowed(POST_CUTOFF, true)).toBe(false);
  });

  it("Cloud + exactly at cutoff → false (>= semantics)", () => {
    expect(isLegacyBlobExportAllowed(AT_CUTOFF, true)).toBe(false);
  });
});
