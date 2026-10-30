import { describe, it, expect } from "vitest";
import { assertExportSourceAllowed } from "@/src/features/analytics-integrations/server/assertExportSourceAllowed";
import {
  areEnrichedWritesActive,
  areLegacyWritesActive,
  InvalidRequestError,
  LEGACY_ANALYTICS_EXPORTER_CUTOFF,
  LEGACY_EXPORT_PROJECT_CUTOFF,
  LEGACY_BLOB_EXPORTER_CUTOFF,
  type V4WriteMode,
  type ExportSourceContext,
} from "@langfuse/shared";

// Thin composition tests only — the policy matrix lives with the policy
// (packages/shared/.../export-source-policy.test.ts).

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const POST_CUTOFF = new Date(
  LEGACY_EXPORT_PROJECT_CUTOFF.getTime() + MS_PER_DAY,
);

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
    ).toThrow(/Enriched export sources are not available/);
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

  // The write-mode gate every save path funnels through (tRPC routers and the
  // public REST PUT). It must accept exactly what the UI offers for the mode.
  describe("write mode gate", () => {
    const ctxFor = (writeMode: V4WriteMode): ExportSourceContext => ({
      isCloud: false,
      enrichedAvailable: areEnrichedWritesActive(writeMode),
      legacyWritesActive: areLegacyWritesActive(writeMode),
    });

    const attempt = (
      writeMode: V4WriteMode,
      nextExportSource:
        | "TRACES_OBSERVATIONS"
        | "TRACES_OBSERVATIONS_EVENTS"
        | "EVENTS",
    ) =>
      assertExportSourceAllowed({ nextExportSource, ctx: ctxFor(writeMode) });

    const cases: Array<
      [
        V4WriteMode,
        "TRACES_OBSERVATIONS" | "TRACES_OBSERVATIONS_EVENTS" | "EVENTS",
        boolean,
      ]
    > = [
      ["legacy", "TRACES_OBSERVATIONS", true],
      ["legacy", "TRACES_OBSERVATIONS_EVENTS", false],
      ["legacy", "EVENTS", false],
      ["dual", "TRACES_OBSERVATIONS", true],
      ["dual", "TRACES_OBSERVATIONS_EVENTS", true],
      ["dual", "EVENTS", true],
      ["events_only", "TRACES_OBSERVATIONS", false],
      ["events_only", "TRACES_OBSERVATIONS_EVENTS", false],
      ["events_only", "EVENTS", true],
    ];

    it.each(cases)("%s + %s → allowed=%s", (writeMode, source, allowed) => {
      if (allowed) {
        expect(() => attempt(writeMode, source)).not.toThrow();
      } else {
        expect(() => attempt(writeMode, source)).toThrow(InvalidRequestError);
      }
    });

    it("keeps a persisted-but-blocked source rejected on an omitted update", () => {
      expect(() =>
        assertExportSourceAllowed({
          nextExportSource: undefined,
          persistedExportSource: "EVENTS",
          ctx: ctxFor("legacy"),
        }),
      ).toThrow(InvalidRequestError);
    });
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
  // Forwarding guard: adapters override the integration-level cutoff through the
  // context. A destructuring assert that dropped the field would silently fall
  // back to the blob cutoff and reject a row its own family grandfathers.
  it("forwards a context-supplied exporterCutoff instead of the blob default", () => {
    // Between the blob cutoff and the analytics one: blocked under the default,
    // grandfathered under the override.
    const between = new Date(
      LEGACY_BLOB_EXPORTER_CUTOFF.getTime() + 24 * 60 * 60 * 1000,
    );
    const base = {
      nextExportSource: "TRACES_OBSERVATIONS" as const,
      ctx: {
        isCloud: true,
        enrichedAvailable: true,
        legacyWritesActive: true,
        projectCreatedAt: new Date(LEGACY_EXPORT_PROJECT_CUTOFF.getTime() - 1),
        integrationCreatedAt: between,
      },
    };
    expect(() => assertExportSourceAllowed(base)).toThrow(InvalidRequestError);
    expect(() =>
      assertExportSourceAllowed({
        ...base,
        ctx: { ...base.ctx, exporterCutoff: LEGACY_ANALYTICS_EXPORTER_CUTOFF },
      }),
    ).not.toThrow();
  });
});
