import { describe, expect, it } from "vitest";

import * as exportSourcePolicy from "./export-source-policy";
import {
  areEnrichedWritesActive,
  areLegacyWritesActive,
  getAvailableExportSources,
  isEnrichedBlobExportSource,
  isLegacyBlobExportSource,
  LEGACY_BLOB_EXPORT_CUTOFF,
  LEGACY_BLOB_EXPORTER_CUTOFF,
  validateExportSource,
  type BlobExportWriteMode,
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

// The integration-level ("exporter") cutoff is per-integration-kind: blob
// storage keeps its own date, product-analytics integrations (Mixpanel,
// PostHog) get a later one. The policy takes it from the context so both
// families share one implementation.
describe("exporterCutoff parameterization", () => {
  // Spec dates, written literally so these behaviour tests do not depend on
  // the constant existing yet; the constants test below pins the exports.
  const ANALYTICS_CUTOFF = new Date("2026-08-15T00:00:00.000Z");
  // Deliberately between the two cutoffs: past blob's 2026-06-22, before
  // analytics' 2026-08-15. Any assertion using it distinguishes "the context's
  // cutoff was honoured" from "the blob default was hard-coded".
  const ROW_BETWEEN_CUTOFFS = new Date("2026-07-01T00:00:00.000Z");

  type Ctx = ExportSourceContext & { exporterCutoff?: Date };

  // projectCreatedAt is pinned pre-project-cutoff throughout so the only Cloud
  // gate in play is the integration-level one.
  const cloud = (over: Partial<Ctx>): Ctx => ({
    isCloud: true,
    enrichedAvailable: true,
    legacyWritesActive: true,
    projectCreatedAt: PROJECT_PRE,
    ...over,
  });

  it("absent exporterCutoff keeps the blob constant as the boundary; supplying one moves it", () => {
    // Blob call sites pass no exporterCutoff and must be unaffected.
    expect(
      reasonOf(
        "TRACES_OBSERVATIONS",
        cloud({ integrationCreatedAt: ROW_BETWEEN_CUTOFFS }),
      ),
    ).toBe("cloud-cutoff");
    // Analytics call sites pass the later cutoff, so the same row is still
    // grandfathered.
    expect(
      reasonOf(
        "TRACES_OBSERVATIONS",
        cloud({
          integrationCreatedAt: ROW_BETWEEN_CUTOFFS,
          exporterCutoff: ANALYTICS_CUTOFF,
        }),
      ),
    ).toBeUndefined();
  });

  it("the supplied cutoff keeps >= semantics on the row's creation date", () => {
    const at = (integrationCreatedAt: Date) =>
      reasonOf(
        "TRACES_OBSERVATIONS",
        cloud({ integrationCreatedAt, exporterCutoff: ANALYTICS_CUTOFF }),
      );
    expect(at(new Date(ANALYTICS_CUTOFF.getTime() - 1))).toBeUndefined();
    expect(at(ANALYTICS_CUTOFF)).toBe("cloud-cutoff");
    expect(at(new Date(ANALYTICS_CUTOFF.getTime() + MS_PER_DAY))).toBe(
      "cloud-cutoff",
    );
  });

  it("a brand-new Cloud row (null createdAt) is pinned to enriched even before the cutoff date passes", () => {
    // Create pins regardless of wall-clock: "no existing row" follows
    // new-customer rules, it is not a date comparison.
    const brandNew = cloud({
      integrationCreatedAt: null,
      exporterCutoff: ANALYTICS_CUTOFF,
    });
    expect(reasonOf("TRACES_OBSERVATIONS", brandNew)).toBe("cloud-cutoff");
    expect(reasonOf("TRACES_OBSERVATIONS_EVENTS", brandNew)).toBe(
      "cloud-cutoff",
    );
    expect(reasonOf("EVENTS", brandNew)).toBeUndefined();
  });

  it("self-hosted ignores exporterCutoff entirely", () => {
    expect(
      reasonOf("TRACES_OBSERVATIONS", {
        isCloud: false,
        enrichedAvailable: true,
        legacyWritesActive: true,
        integrationCreatedAt: null,
        exporterCutoff: ANALYTICS_CUTOFF,
      } as Ctx),
    ).toBeUndefined();
  });

  it("leaves EVENTS as the only selectable source for a brand-new Cloud analytics integration", () => {
    expect(
      getAvailableExportSources(
        cloud({
          integrationCreatedAt: null,
          exporterCutoff: ANALYTICS_CUTOFF,
        }),
      ),
    ).toEqual([
      { source: "TRACES_OBSERVATIONS", blockedReason: "cloud-cutoff" },
      { source: "TRACES_OBSERVATIONS_EVENTS", blockedReason: "cloud-cutoff" },
      { source: "EVENTS" },
    ]);
  });

  it("exports both cutoff constants; the blob one is unchanged", () => {
    // Moving LEGACY_BLOB_EXPORTER_CUTOFF instead of adding a second constant
    // would silently re-open legacy sources for blob rows created between the
    // two dates, so both values are pinned.
    expect(LEGACY_BLOB_EXPORTER_CUTOFF.toISOString()).toBe(
      "2026-06-22T00:00:00.000Z",
    );
    const analyticsCutoff = (exportSourcePolicy as unknown as Record<string, unknown>)
      .LEGACY_ANALYTICS_EXPORTER_CUTOFF;
    expect(analyticsCutoff).toBeInstanceOf(Date);
    expect((analyticsCutoff as Date | undefined)?.toISOString()).toBe(
      ANALYTICS_CUTOFF.toISOString(),
    );
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

// The active write mode is the single source of truth for which export
// sources hold data. Neither the V4 frontend preview flag nor a per-user beta
// opt-in may re-enter this decision.
describe("write mode drives export-source availability", () => {
  const WRITE_MODES: readonly BlobExportWriteMode[] = [
    "legacy",
    "dual",
    "events_only",
  ];

  const ctxFor = (
    writeMode: BlobExportWriteMode,
    over: Partial<ExportSourceContext> = {},
  ): ExportSourceContext => ({
    isCloud: false,
    enrichedAvailable: areEnrichedWritesActive(writeMode),
    legacyWritesActive: areLegacyWritesActive(writeMode),
    ...over,
  });

  it("areEnrichedWritesActive: enriched rows exist in every mode but legacy", () => {
    expect(areEnrichedWritesActive("legacy")).toBe(false);
    expect(areEnrichedWritesActive("dual")).toBe(true);
    expect(areEnrichedWritesActive("events_only")).toBe(true);
  });

  it("areLegacyWritesActive: legacy rows exist in every mode but events_only", () => {
    expect(areLegacyWritesActive("legacy")).toBe(true);
    expect(areLegacyWritesActive("dual")).toBe(true);
    expect(areLegacyWritesActive("events_only")).toBe(false);
  });

  // The whole selector, per mode: legacy → legacy sources only, events_only →
  // events only, dual → both. Anything else means a surface offers a source
  // whose data is not being written.
  it.each([
    [
      "legacy",
      [
        { source: "TRACES_OBSERVATIONS" },
        {
          source: "TRACES_OBSERVATIONS_EVENTS",
          blockedReason: "enriched-unavailable",
        },
        { source: "EVENTS", blockedReason: "enriched-unavailable" },
      ],
    ],
    [
      "dual",
      [
        { source: "TRACES_OBSERVATIONS" },
        { source: "TRACES_OBSERVATIONS_EVENTS" },
        { source: "EVENTS" },
      ],
    ],
    [
      "events_only",
      [
        {
          source: "TRACES_OBSERVATIONS",
          blockedReason: "legacy-writes-disabled",
        },
        {
          source: "TRACES_OBSERVATIONS_EVENTS",
          blockedReason: "legacy-writes-disabled",
        },
        { source: "EVENTS" },
      ],
    ],
  ] as const)(
    "write mode %s yields exactly this availability",
    (mode, expected) => {
      expect(getAvailableExportSources(ctxFor(mode))).toEqual(expected);
    },
  );

  // No special case: the combined source needs both halves, so only dual can
  // offer it. A hand-rolled rule for it would drift from the two predicates.
  it("TRACES_OBSERVATIONS_EVENTS requires dual, purely from the two rules", () => {
    const ok = (mode: BlobExportWriteMode) =>
      validateExportSource("TRACES_OBSERVATIONS_EVENTS", ctxFor(mode)).ok;
    expect(ok("legacy")).toBe(false);
    expect(ok("dual")).toBe(true);
    expect(ok("events_only")).toBe(false);
    // …and the combination is exactly "legacy AND enriched".
    for (const mode of WRITE_MODES) {
      expect(ok(mode)).toBe(
        areLegacyWritesActive(mode) && areEnrichedWritesActive(mode),
      );
    }
  });

  // The per-user beta opt-in and the Cloud deployment flag are gone from this
  // decision: a pre-cutoff Cloud project sees exactly what self-hosted sees.
  it("availability is deployment-agnostic for pre-cutoff Cloud projects", () => {
    for (const mode of WRITE_MODES) {
      expect(
        getAvailableExportSources(
          ctxFor(mode, {
            isCloud: true,
            projectCreatedAt: PROJECT_PRE,
            integrationCreatedAt: ROW_PRE,
          }),
        ),
      ).toEqual(getAvailableExportSources(ctxFor(mode)));
    }
  });

  // Deletion guard: the old preview-flag helper must not survive as a second,
  // divergent answer to "is enriched available?".
  it("no longer exports isEnrichedBlobExportAvailable", () => {
    expect("isEnrichedBlobExportAvailable" in exportSourcePolicy).toBe(false);
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
