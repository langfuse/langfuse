import { describe, expect, it } from "vitest";

import * as exportSourcePolicy from "./export-source-policy";
import {
  areEnrichedWritesActive,
  areLegacyWritesActive,
  defaultExportSource,
  getAvailableExportSources,
  isEnrichedExportSource,
  isLegacyExporter,
  isLegacyExportSource,
  LEGACY_EXPORT_PROJECT_CUTOFF,
  LEGACY_ANALYTICS_EXPORTER_CUTOFF,
  LEGACY_BLOB_EXPORTER_CUTOFF,
  validateExportSource,
  type V4WriteMode,
  type ExportSourceContext,
} from "./export-source-policy";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PROJECT_PRE = new Date(
  LEGACY_EXPORT_PROJECT_CUTOFF.getTime() - MS_PER_DAY,
);
const PROJECT_AT = LEGACY_EXPORT_PROJECT_CUTOFF;
const PROJECT_POST = new Date(
  LEGACY_EXPORT_PROJECT_CUTOFF.getTime() + MS_PER_DAY,
);
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

// The active write mode is the single source of truth for which export
// sources hold data. Neither the V4 frontend preview flag nor a per-user beta
// opt-in may re-enter this decision.
describe("write mode drives export-source availability", () => {
  const WRITE_MODES: readonly V4WriteMode[] = ["legacy", "dual", "events_only"];

  const ctxFor = (
    writeMode: V4WriteMode,
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
    const ok = (mode: V4WriteMode) =>
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

describe("isLegacyExportSource", () => {
  it("is true for the legacy sources", () => {
    expect(isLegacyExportSource("TRACES_OBSERVATIONS")).toBe(true);
    expect(isLegacyExportSource("TRACES_OBSERVATIONS_EVENTS")).toBe(true);
  });

  it("is false for the enriched-only source and nullish values", () => {
    expect(isLegacyExportSource("EVENTS")).toBe(false);
    expect(isLegacyExportSource(null)).toBe(false);
    expect(isLegacyExportSource(undefined)).toBe(false);
  });

  it("TRACES_OBSERVATIONS_EVENTS counts as both legacy and enriched", () => {
    // It exports the legacy tables *and* the enriched events, so both
    // predicates must return true — this project still needs the warning.
    const source = "TRACES_OBSERVATIONS_EVENTS";
    expect(isLegacyExportSource(source)).toBe(true);
    expect(isEnrichedExportSource(source)).toBe(true);
  });

  it("EVENTS is enriched-only, never legacy", () => {
    const source = "EVENTS";
    expect(isLegacyExportSource(source)).toBe(false);
    expect(isEnrichedExportSource(source)).toBe(true);
  });
});

// Each integration family carries its own integration-level cutoff. Dates are
// derived from the constants, never written as literals: both are overridable
// via NEXT_PUBLIC_* for local testing, and a literal would silently stop
// testing the shipped value.
describe("per-family exporter cutoff", () => {
  const cloud = (over: Partial<ExportSourceContext>): ExportSourceContext =>
    ctx({ isCloud: true, projectCreatedAt: PROJECT_PRE, ...over });

  it("defaults to the blob cutoff when the context omits one", () => {
    // Grandfathered under the blob default...
    expect(
      reasonOf("TRACES_OBSERVATIONS", cloud({ integrationCreatedAt: ROW_PRE })),
    ).toBeUndefined();
    // ...and blocked once the row reaches it.
    expect(
      reasonOf("TRACES_OBSERVATIONS", cloud({ integrationCreatedAt: ROW_AT })),
    ).toBe("cloud-cutoff");
  });

  it("a later context cutoff grandfathers a row the blob default would block", () => {
    // Between the two cutoffs: blocked under the blob default, allowed under the
    // analytics one. This is the whole point of the parameter.
    const between = new Date(
      LEGACY_BLOB_EXPORTER_CUTOFF.getTime() + MS_PER_DAY,
    );
    expect(between < LEGACY_ANALYTICS_EXPORTER_CUTOFF).toBe(true);
    expect(
      reasonOf("TRACES_OBSERVATIONS", cloud({ integrationCreatedAt: between })),
    ).toBe("cloud-cutoff");
    expect(
      reasonOf(
        "TRACES_OBSERVATIONS",
        cloud({
          integrationCreatedAt: between,
          exporterCutoff: LEGACY_ANALYTICS_EXPORTER_CUTOFF,
        }),
      ),
    ).toBeUndefined();
  });

  it("a brand-new Cloud row is blocked under any cutoff, today's date notwithstanding", () => {
    for (const exporterCutoff of [
      undefined,
      LEGACY_BLOB_EXPORTER_CUTOFF,
      LEGACY_ANALYTICS_EXPORTER_CUTOFF,
    ]) {
      expect(
        reasonOf(
          "TRACES_OBSERVATIONS",
          cloud({ integrationCreatedAt: null, exporterCutoff }),
        ),
      ).toBe("cloud-cutoff");
    }
  });

  it("self-hosted is exempt from every exporter cutoff", () => {
    expect(
      isLegacyExporter(null, false, LEGACY_ANALYTICS_EXPORTER_CUTOFF),
    ).toBe(true);
    expect(
      reasonOf(
        "TRACES_OBSERVATIONS",
        ctx({
          isCloud: false,
          integrationCreatedAt: null,
          exporterCutoff: LEGACY_ANALYTICS_EXPORTER_CUTOFF,
        }),
      ),
    ).toBeUndefined();
  });

  it("names the context cutoff in the rejection message, not the blob default", () => {
    const res = validateExportSource(
      "TRACES_OBSERVATIONS",
      cloud({
        integrationCreatedAt: null,
        exporterCutoff: LEGACY_ANALYTICS_EXPORTER_CUTOFF,
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain(
      LEGACY_ANALYTICS_EXPORTER_CUTOFF.toISOString(),
    );
    expect(res.message).not.toContain(
      LEGACY_BLOB_EXPORTER_CUTOFF.toISOString(),
    );
  });

  it("the analytics cutoff postdates the blob one", () => {
    // Guards against someone 'tidying' the analytics constant onto the blob
    // date, which would retroactively invalidate grandfathered analytics rows.
    expect(LEGACY_ANALYTICS_EXPORTER_CUTOFF.getTime()).toBeGreaterThan(
      LEGACY_BLOB_EXPORTER_CUTOFF.getTime(),
    );
  });
});

describe("defaultExportSource", () => {
  const forWriteMode = (
    writeMode: V4WriteMode,
    over: Partial<ExportSourceContext> = {},
  ) =>
    defaultExportSource(
      ctx({
        enrichedAvailable: areEnrichedWritesActive(writeMode),
        legacyWritesActive: areLegacyWritesActive(writeMode),
        ...over,
      }),
    );

  it("prefers enriched wherever the deployment writes it", () => {
    // `dual` is the case that used to disagree between the settings page and
    // the routers: the page defaulted to EVENTS while the routers created
    // TRACES_OBSERVATIONS. One rule now answers both.
    expect(forWriteMode("dual")).toBe("EVENTS");
    expect(forWriteMode("events_only")).toBe("EVENTS");
  });

  it("falls back to legacy only when enriched cannot be served", () => {
    expect(forWriteMode("legacy")).toBe("TRACES_OBSERVATIONS");
  });

  it("pins enriched on Cloud where the cutoffs block legacy", () => {
    // A brand-new Cloud row is post-cutoff, so legacy is not selectable even
    // under a write mode that cannot serve enriched — returning legacy would
    // hand back a value the caller is forbidden to save.
    expect(
      forWriteMode("legacy", { isCloud: true, integrationCreatedAt: null }),
    ).toBe("EVENTS");
    expect(
      forWriteMode("legacy", { isCloud: true, projectCreatedAt: PROJECT_POST }),
    ).toBe("EVENTS");
  });

  it("still allows legacy for a grandfathered Cloud row", () => {
    expect(
      forWriteMode("legacy", {
        isCloud: true,
        projectCreatedAt: PROJECT_PRE,
        integrationCreatedAt: ROW_PRE,
      }),
    ).toBe("TRACES_OBSERVATIONS");
  });

  it("never returns a source it just declared unselectable", () => {
    const modes: V4WriteMode[] = ["legacy", "dual", "events_only"];
    for (const mode of modes) {
      for (const isCloud of [false, true]) {
        // Write mode `legacy` on Cloud cannot serve enriched and cannot use
        // legacy either, so no source is selectable; the default is then a
        // misconfiguration signal rather than a usable value.
        if (mode === "legacy" && isCloud) continue;
        const c = ctx({
          isCloud,
          enrichedAvailable: areEnrichedWritesActive(mode),
          legacyWritesActive: areLegacyWritesActive(mode),
          integrationCreatedAt: null,
        });
        expect(validateExportSource(defaultExportSource(c), c).ok).toBe(true);
      }
    }
  });
});
