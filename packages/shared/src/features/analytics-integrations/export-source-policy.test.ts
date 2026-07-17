import { describe, expect, it } from "vitest";

import {
  getAvailableExportSources,
  isEnrichedBlobExportSource,
  isLegacyBlobExportSource,
  LEGACY_BLOB_EXPORT_CUTOFF,
  LEGACY_BLOB_EXPORTER_CUTOFF,
  validateExportSource,
  type ExportSourceContext,
} from "./export-source-policy";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PROJECT_PRE = new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() - MS_PER_DAY);
const PROJECT_AT = LEGACY_BLOB_EXPORT_CUTOFF;
const PROJECT_POST = new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() + MS_PER_DAY);
const ROW_PRE = new Date(LEGACY_BLOB_EXPORTER_CUTOFF.getTime() - MS_PER_DAY);
const ROW_AT = LEGACY_BLOB_EXPORTER_CUTOFF;

const ctx = (over: Partial<ExportSourceContext>): ExportSourceContext => ({
  isCloud: false,
  enrichedAvailable: true,
  legacyWritesActive: true,
  ...over,
});

const reasonOf = (
  source: Parameters<typeof validateExportSource>[0],
  c: ExportSourceContext,
) => {
  const res = validateExportSource(source, c);
  return res.ok ? undefined : res.reason;
};

describe("validateExportSource matrix", () => {
  it("EVENTS: ok whenever enriched is available, blocked otherwise", () => {
    expect(reasonOf("EVENTS", ctx({}))).toBeUndefined();
    expect(reasonOf("EVENTS", ctx({ isCloud: true }))).toBeUndefined();
    expect(reasonOf("EVENTS", ctx({ enrichedAvailable: false }))).toBe(
      "enriched-unavailable",
    );
  });

  it("legacy on self-hosted: ok regardless of dates (cutoffs are Cloud-only)", () => {
    for (const source of [
      "TRACES_OBSERVATIONS",
      "TRACES_OBSERVATIONS_EVENTS",
    ] as const) {
      expect(
        reasonOf(
          source,
          ctx({ projectCreatedAt: PROJECT_POST, integrationCreatedAt: null }),
        ),
      ).toBeUndefined();
    }
  });

  it("legacy on Cloud: project cutoff with >= semantics", () => {
    const cloud = (projectCreatedAt: Date) =>
      ctx({ isCloud: true, projectCreatedAt, integrationCreatedAt: ROW_PRE });
    expect(reasonOf("TRACES_OBSERVATIONS", cloud(PROJECT_PRE))).toBeUndefined();
    expect(reasonOf("TRACES_OBSERVATIONS", cloud(PROJECT_AT))).toBe(
      "cloud-cutoff",
    );
    expect(reasonOf("TRACES_OBSERVATIONS", cloud(PROJECT_POST))).toBe(
      "cloud-cutoff",
    );
    // Distinct messages for the two cutoff paths (log-countable).
    const res = validateExportSource(
      "TRACES_OBSERVATIONS",
      cloud(PROJECT_POST),
    );
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.message).toContain("Cloud projects");
  });

  it("legacy on Cloud: integration cutoff — new row (null) and >= cutoff blocked, pre-cutoff row grandfathered", () => {
    const cloud = (integrationCreatedAt: Date | null) =>
      ctx({
        isCloud: true,
        projectCreatedAt: PROJECT_PRE,
        integrationCreatedAt,
      });
    expect(reasonOf("TRACES_OBSERVATIONS", cloud(ROW_PRE))).toBeUndefined();
    expect(reasonOf("TRACES_OBSERVATIONS", cloud(ROW_AT))).toBe("cloud-cutoff");
    expect(reasonOf("TRACES_OBSERVATIONS", cloud(null))).toBe("cloud-cutoff");
    const res = validateExportSource("TRACES_OBSERVATIONS", cloud(null));
    if (!res.ok)
      expect(res.message).toContain("integrations created on or after");
  });

  it("omitted context fields skip their check", () => {
    // No project in scope (e.g. service backstop) → project gate skipped.
    expect(
      reasonOf(
        "TRACES_OBSERVATIONS",
        ctx({ isCloud: true, integrationCreatedAt: ROW_PRE }),
      ),
    ).toBeUndefined();
    // No integration-level cutoff (PostHog/Mixpanel) → exporter gate skipped.
    expect(
      reasonOf(
        "TRACES_OBSERVATIONS",
        ctx({ isCloud: true, projectCreatedAt: PROJECT_PRE }),
      ),
    ).toBeUndefined();
  });

  it("legacy under events_only: blocked by capability, deployment-agnostic; EVENTS unaffected", () => {
    const eventsOnly = ctx({ legacyWritesActive: false });
    expect(reasonOf("TRACES_OBSERVATIONS", eventsOnly)).toBe(
      "legacy-writes-disabled",
    );
    expect(reasonOf("TRACES_OBSERVATIONS_EVENTS", eventsOnly)).toBe(
      "legacy-writes-disabled",
    );
    expect(reasonOf("EVENTS", eventsOnly)).toBeUndefined();
    // Deployment-agnostic: applies on Cloud too, but the Cloud cutoff wins
    // the reason so Cloud users never see env-var messaging.
    expect(
      reasonOf(
        "TRACES_OBSERVATIONS",
        ctx({ isCloud: true, legacyWritesActive: false }),
      ),
    ).toBe("legacy-writes-disabled");
    expect(
      reasonOf(
        "TRACES_OBSERVATIONS",
        ctx({
          isCloud: true,
          legacyWritesActive: false,
          projectCreatedAt: PROJECT_POST,
        }),
      ),
    ).toBe("cloud-cutoff");
    // Operator-facing message names the env var.
    const res = validateExportSource("TRACES_OBSERVATIONS", eventsOnly);
    if (!res.ok) expect(res.message).toContain("events_only");
  });

  it("legacy on dual/legacy write modes: unaffected", () => {
    expect(
      reasonOf("TRACES_OBSERVATIONS", ctx({ legacyWritesActive: true })),
    ).toBeUndefined();
  });

  it("TRACES_OBSERVATIONS_EVENTS is both enriched and legacy; enriched-unavailable wins", () => {
    expect(
      reasonOf(
        "TRACES_OBSERVATIONS_EVENTS",
        ctx({
          isCloud: true,
          enrichedAvailable: false,
          projectCreatedAt: PROJECT_POST,
        }),
      ),
    ).toBe("enriched-unavailable");
    // Legacy gates still apply when enriched is available.
    expect(
      reasonOf(
        "TRACES_OBSERVATIONS_EVENTS",
        ctx({ isCloud: true, projectCreatedAt: PROJECT_POST }),
      ),
    ).toBe("cloud-cutoff");
  });
});

describe("getAvailableExportSources", () => {
  it("returns all sources in UI order with per-source reasons", () => {
    const sources = getAvailableExportSources(
      ctx({ isCloud: true, projectCreatedAt: PROJECT_POST }),
    );
    expect(sources).toEqual([
      { source: "TRACES_OBSERVATIONS", blockedReason: "cloud-cutoff" },
      { source: "TRACES_OBSERVATIONS_EVENTS", blockedReason: "cloud-cutoff" },
      { source: "EVENTS" },
    ]);
  });

  it("marks nothing blocked on a permissive context", () => {
    expect(getAvailableExportSources(ctx({}))).toEqual([
      { source: "TRACES_OBSERVATIONS" },
      { source: "TRACES_OBSERVATIONS_EVENTS" },
      { source: "EVENTS" },
    ]);
  });
});

describe("isLegacyBlobExportSource", () => {
  it("is true for the legacy sources", () => {
    expect(isLegacyBlobExportSource("TRACES_OBSERVATIONS")).toBe(true);
    expect(isLegacyBlobExportSource("TRACES_OBSERVATIONS_EVENTS")).toBe(true);
  });

  it("is false for the enriched-only source and nullish values", () => {
    expect(isLegacyBlobExportSource("EVENTS")).toBe(false);
    expect(isLegacyBlobExportSource(null)).toBe(false);
    expect(isLegacyBlobExportSource(undefined)).toBe(false);
  });

  it("TRACES_OBSERVATIONS_EVENTS counts as both legacy and enriched", () => {
    // It exports the legacy tables *and* the enriched events, so both
    // predicates must return true — this project still needs the warning.
    const source = "TRACES_OBSERVATIONS_EVENTS";
    expect(isLegacyBlobExportSource(source)).toBe(true);
    expect(isEnrichedBlobExportSource(source)).toBe(true);
  });

  it("EVENTS is enriched-only, never legacy", () => {
    const source = "EVENTS";
    expect(isLegacyBlobExportSource(source)).toBe(false);
    expect(isEnrichedBlobExportSource(source)).toBe(true);
  });
});
