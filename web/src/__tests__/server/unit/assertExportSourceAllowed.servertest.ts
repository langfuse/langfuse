import { describe, it, expect } from "vitest";
import { assertExportSourceAllowed } from "@/src/features/analytics-integrations/server/assertExportSourceAllowed";
import {
  InvalidRequestError,
  LEGACY_BLOB_EXPORT_CUTOFF,
  type ExportSourceContext,
} from "@langfuse/shared";

// Thin composition tests only — the policy matrix lives with the policy
// (packages/shared/.../export-source-policy.test.ts).

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const POST_CUTOFF = new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() + MS_PER_DAY);

const cloudPostCutoff: ExportSourceContext = {
  isCloud: true,
  enrichedAvailable: true,
  legacyWritesActive: true,
  projectCreatedAt: POST_CUTOFF,
};

describe("assertExportSourceAllowed", () => {
  it("throws InvalidRequestError with the policy message for a blocked explicit source", () => {
    expect(() =>
      assertExportSourceAllowed({
        nextExportSource: "TRACES_OBSERVATIONS",
        ctx: cloudPostCutoff,
      }),
    ).toThrow(InvalidRequestError);
    expect(() =>
      assertExportSourceAllowed({
        nextExportSource: "TRACES_OBSERVATIONS",
        ctx: cloudPostCutoff,
      }),
    ).toThrow(/Cloud projects/);
  });

  it("allows an allowed explicit source", () => {
    expect(() =>
      assertExportSourceAllowed({
        nextExportSource: "EVENTS",
        ctx: cloudPostCutoff,
      }),
    ).not.toThrow();
  });

  it("omitted source: grandfathers a persisted legacy value past the Cloud cutoffs", () => {
    expect(() =>
      assertExportSourceAllowed({
        nextExportSource: undefined,
        persistedExportSource: "TRACES_OBSERVATIONS",
        ctx: { ...cloudPostCutoff, integrationCreatedAt: POST_CUTOFF },
      }),
    ).not.toThrow();
  });

  it("omitted source: rejects a persisted value the deployment cannot export (capability reasons)", () => {
    expect(() =>
      assertExportSourceAllowed({
        nextExportSource: undefined,
        persistedExportSource: "EVENTS",
        ctx: {
          isCloud: false,
          enrichedAvailable: false,
          legacyWritesActive: true,
        },
      }),
    ).toThrow(/Enriched blob export is not available/);
    expect(() =>
      assertExportSourceAllowed({
        nextExportSource: undefined,
        persistedExportSource: "TRACES_OBSERVATIONS",
        ctx: {
          isCloud: false,
          enrichedAvailable: true,
          legacyWritesActive: false,
        },
      }),
    ).toThrow(/events_only/);
  });

  it("omitted source without a persisted row is a no-op", () => {
    expect(() =>
      assertExportSourceAllowed({
        nextExportSource: undefined,
        persistedExportSource: null,
        ctx: cloudPostCutoff,
      }),
    ).not.toThrow();
  });
});
