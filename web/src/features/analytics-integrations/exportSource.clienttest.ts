import {
  AnalyticsIntegrationExportSource,
  LEGACY_ANALYTICS_EXPORTER_CUTOFF,
  LEGACY_BLOB_EXPORT_CUTOFF,
  LEGACY_BLOB_EXPORTER_CUTOFF,
  type BlobExportWriteMode,
  type ExportSourceContext,
} from "@langfuse/shared";

import {
  buildExportSourceContext,
  getDefaultExportSource,
  getExportSourceFormValue,
  getExportSourceOptions,
  getExportSourceUnavailableMessage,
  isExportSourceSelectable,
  shouldHideExportSourceSelector,
  shouldShowExportSourceField,
} from "./exportSource";

// UI-adapter tests. The policy matrix itself lives with the policy
// (packages/shared/.../export-source-policy.test.ts); these cover the
// option-list/form-value/alert derivations on representative contexts.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PROJECT_PRE = new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() - MS_PER_DAY);
const PROJECT_POST = new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() + MS_PER_DAY);
const ROW_PRE = new Date(LEGACY_BLOB_EXPORTER_CUTOFF.getTime() - MS_PER_DAY);

const cloudPreCutoff: ExportSourceContext = {
  isCloud: true,
  enrichedAvailable: true,
  legacyWritesActive: true,
  projectCreatedAt: PROJECT_PRE,
  integrationCreatedAt: ROW_PRE,
};
const cloudPostCutoff: ExportSourceContext = {
  isCloud: true,
  enrichedAvailable: true,
  legacyWritesActive: true,
  projectCreatedAt: PROJECT_POST,
  integrationCreatedAt: ROW_PRE,
};
const selfHostedWithPreview: ExportSourceContext = {
  isCloud: false,
  enrichedAvailable: true,
  legacyWritesActive: true,
};
const selfHostedRolledBack: ExportSourceContext = {
  isCloud: false,
  enrichedAvailable: false,
  legacyWritesActive: true,
};
// Self-hosted events_only: v3 tables no longer written (LFE-10148). Enriched
// stays available (events_only requires the V4 preview opt-in).
const selfHostedEventsOnly: ExportSourceContext = {
  isCloud: false,
  enrichedAvailable: true,
  legacyWritesActive: false,
};

// Only the blob-storage form calls getExportSourceFormValue; the analytics
// pages use getDefaultExportSource (covered further down).
describe("getExportSourceFormValue (blob storage form)", () => {
  it("keeps any persisted value regardless of deployment state (LFE-10296)", () => {
    for (const persisted of Object.values(AnalyticsIntegrationExportSource)) {
      for (const ctx of [
        cloudPreCutoff,
        cloudPostCutoff,
        selfHostedWithPreview,
        selfHostedRolledBack,
      ]) {
        expect(getExportSourceFormValue(persisted, ctx)).toBe(persisted);
      }
    }
  });

  it("defaults new configurations to EVENTS when enriched export is available", () => {
    expect(getExportSourceFormValue(undefined, cloudPreCutoff)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
    expect(getExportSourceFormValue(undefined, cloudPostCutoff)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
    expect(getExportSourceFormValue(null, selfHostedWithPreview)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
  });

  it("defaults new configurations to TRACES_OBSERVATIONS when enriched export is unavailable", () => {
    expect(getExportSourceFormValue(undefined, selfHostedRolledBack)).toBe(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    );
  });

  it("defaults new configurations to EVENTS on events_only, keeps a persisted legacy value (LFE-10148)", () => {
    expect(getExportSourceFormValue(undefined, selfHostedEventsOnly)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
    expect(
      getExportSourceFormValue(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        selfHostedEventsOnly,
      ),
    ).toBe(AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS);
  });
});

describe("isExportSourceSelectable", () => {
  it("rejects enriched sources when enriched export is unavailable, legacy stays", () => {
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.EVENTS,
        selfHostedRolledBack,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
        selfHostedRolledBack,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        selfHostedRolledBack,
      ),
    ).toBe(true);
  });

  it("rejects legacy sources on post-cutoff Cloud projects, EVENTS stays", () => {
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        cloudPostCutoff,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.EVENTS,
        cloudPostCutoff,
      ),
    ).toBe(true);
  });

  it("accepts all sources when everything is available", () => {
    for (const source of Object.values(AnalyticsIntegrationExportSource)) {
      expect(isExportSourceSelectable(source, cloudPreCutoff)).toBe(true);
      expect(isExportSourceSelectable(source, selfHostedWithPreview)).toBe(
        true,
      );
    }
  });

  it("rejects legacy sources on events_only, EVENTS stays (LFE-10148)", () => {
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        selfHostedEventsOnly,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.EVENTS,
        selfHostedEventsOnly,
      ),
    ).toBe(true);
  });
});

describe("getExportSourceOptions", () => {
  it("offers all sources when everything is available", () => {
    const options = getExportSourceOptions(undefined, cloudPreCutoff);
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
      AnalyticsIntegrationExportSource.EVENTS,
    ]);
    expect(options.every((o) => !o.unavailable)).toBe(true);
  });

  it("offers only EVENTS for post-cutoff Cloud projects", () => {
    const options = getExportSourceOptions(undefined, cloudPostCutoff);
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.EVENTS,
    ]);
  });

  it("marks a persisted legacy source unavailable on events_only, EVENTS selectable (LFE-10148)", () => {
    const options = getExportSourceOptions(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      selfHostedEventsOnly,
    );
    expect(
      options.find(
        (o) => o.value === AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      )?.unavailable,
    ).toBe(true);
    expect(
      options.find((o) => o.value === AnalyticsIntegrationExportSource.EVENTS)
        ?.unavailable,
    ).toBe(false);
    expect(shouldHideExportSourceSelector(options)).toBe(false);
  });

  it("includes a stale persisted enriched source, marked unavailable (LFE-10296)", () => {
    const options = getExportSourceOptions(
      AnalyticsIntegrationExportSource.EVENTS,
      selfHostedRolledBack,
    );
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      AnalyticsIntegrationExportSource.EVENTS,
    ]);
    expect(
      options.find((o) => o.value === AnalyticsIntegrationExportSource.EVENTS)
        ?.unavailable,
    ).toBe(true);
  });
});

describe("shouldHideExportSourceSelector", () => {
  it("hides the selector when there is exactly one selectable source", () => {
    expect(
      shouldHideExportSourceSelector(
        getExportSourceOptions(undefined, cloudPostCutoff),
      ),
    ).toBe(true);
    // Rolled-back self-hosted with a persisted legacy source: legacy only.
    expect(
      shouldHideExportSourceSelector(
        getExportSourceOptions(
          AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
          selfHostedRolledBack,
        ),
      ),
    ).toBe(true);
  });

  it("keeps the selector when there is a real choice", () => {
    expect(
      shouldHideExportSourceSelector(
        getExportSourceOptions(undefined, cloudPreCutoff),
      ),
    ).toBe(false);
  });

  it("keeps the selector when the sole option is the stale persisted source", () => {
    // The unavailable-source alert points at the selector; hiding it here
    // would strand the user with a blocked save and nothing to change.
    const options = getExportSourceOptions(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      cloudPostCutoff,
    );
    expect(options).toHaveLength(2);
    // Persisted legacy stays visible (unavailable) next to EVENTS.
    expect(options[0].unavailable).toBe(true);
    expect(shouldHideExportSourceSelector(options)).toBe(false);
  });
});

// The settings pages (blob storage, PostHog, Mixpanel) build their context
// through buildExportSourceContext from the write mode the integration router
// reports — not from the session's beta flag and not from a frontend preview
// env var. Driving these cases through the real builder is what covers that
// wiring; the builder takes no session or beta input at all.
describe("write mode drives the settings-page selector", () => {
  const WRITE_MODES: BlobExportWriteMode[] = ["legacy", "dual", "events_only"];

  const ctxFor = (
    writeMode: BlobExportWriteMode,
    over: Partial<
      Omit<ExportSourceContext, "enrichedAvailable" | "legacyWritesActive">
    > = {},
  ): ExportSourceContext =>
    buildExportSourceContext({ writeMode, isCloud: false, ...over });

  const selectableValues = (ctx: ExportSourceContext) =>
    getExportSourceOptions(undefined, ctx)
      .filter((o) => !o.unavailable)
      .map((o) => o.value);

  const offered: Array<
    [BlobExportWriteMode, AnalyticsIntegrationExportSource[]]
  > = [
    ["legacy", [AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS]],
    [
      "dual",
      [
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
        AnalyticsIntegrationExportSource.EVENTS,
      ],
    ],
    ["events_only", [AnalyticsIntegrationExportSource.EVENTS]],
  ];

  it.each(offered)(
    "write mode %s offers exactly the sources it still writes",
    (mode, expected) => {
      expect(selectableValues(ctxFor(mode))).toEqual(expected);
    },
  );

  const defaults: Array<
    [BlobExportWriteMode, AnalyticsIntegrationExportSource]
  > = [
    ["legacy", AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS],
    ["dual", AnalyticsIntegrationExportSource.EVENTS],
    ["events_only", AnalyticsIntegrationExportSource.EVENTS],
  ];

  // The settings-page create default: areEnrichedWritesActive(writeMode)
  // ? EVENTS : TRACES_OBSERVATIONS. The tRPC/REST routers keep their own,
  // older default for an omitted exportSource (TRACES_OBSERVATIONS on dual);
  // that divergence predates this change and is tracked separately.
  it.each(defaults)(
    "write mode %s picks %s as the settings-page create default",
    (mode, expected) => {
      expect(getExportSourceFormValue(undefined, ctxFor(mode))).toBe(expected);
    },
  );

  // Precedence: when legacy is blocked by the Cloud cutoff, the page pins
  // EVENTS even though the general rule would pick TRACES_OBSERVATIONS for a
  // write mode without enriched writes. Only this ordering distinguishes the
  // two rules; every other combination agrees.
  it("post-cutoff Cloud pins EVENTS ahead of the write-mode rule", () => {
    const ctx = ctxFor("legacy", {
      isCloud: true,
      projectCreatedAt: PROJECT_POST,
      integrationCreatedAt: ROW_PRE,
    });
    expect(ctx.enrichedAvailable).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        ctx,
      ),
    ).toBe(false);
    expect(getExportSourceFormValue(undefined, ctx)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
  });

  // Same pinning on the reachable Cloud configuration, where the write-mode
  // rule already agrees — this is the case real Cloud projects hit.
  it("post-cutoff Cloud on dual pins EVENTS", () => {
    expect(
      getExportSourceFormValue(
        undefined,
        ctxFor("dual", {
          isCloud: true,
          projectCreatedAt: PROJECT_POST,
          integrationCreatedAt: ROW_PRE,
        }),
      ),
    ).toBe(AnalyticsIntegrationExportSource.EVENTS);
  });

  // A source that was legal when it was saved must never silently vanish: the
  // user has to see why their save is blocked and what to switch to.
  const blockedPersisted: Array<
    [BlobExportWriteMode, AnalyticsIntegrationExportSource]
  > = [
    ["legacy", AnalyticsIntegrationExportSource.EVENTS],
    ["legacy", AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS],
    ["events_only", AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS],
    [
      "events_only",
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
    ],
  ];

  it.each(blockedPersisted)(
    "write mode %s keeps a persisted %s visible and greyed out",
    (mode, persisted) => {
      const ctx = ctxFor(mode);
      const options = getExportSourceOptions(persisted, ctx);
      expect(options.map((o) => o.value)).toContain(persisted);
      expect(options.find((o) => o.value === persisted)?.unavailable).toBe(
        true,
      );
      // The form keeps the persisted value, so the blocked-save alert has a
      // selected option to point at.
      expect(getExportSourceFormValue(persisted, ctx)).toBe(persisted);
      expect(shouldHideExportSourceSelector(options)).toBe(false);
    },
  );

  // No per-user beta gate and no Cloud-specific enriched path remain, so a
  // pre-cutoff Cloud project renders exactly what self-hosted renders.
  it.each(WRITE_MODES)(
    "pre-cutoff Cloud renders the same options as self-hosted on %s",
    (mode) => {
      expect(
        getExportSourceOptions(
          undefined,
          ctxFor(mode, {
            isCloud: true,
            projectCreatedAt: PROJECT_PRE,
            integrationCreatedAt: ROW_PRE,
          }),
        ),
      ).toEqual(getExportSourceOptions(undefined, ctxFor(mode)));
    },
  );
});

// The two derivations the Mixpanel and PostHog settings pages actually call:
// shouldShowExportSourceField and getDefaultExportSource. Contexts below mirror
// what those pages build (enrichedAvailable from the write mode, the analytics
// exporter cutoff supplied), so these assertions cover shipped behaviour.
describe("analytics integrations: settings-page field visibility and default", () => {
  type Ctx = ExportSourceContext & { exporterCutoff?: Date };

  // Derived from the constant, never a literal: the cutoff is overridable via
  // NEXT_PUBLIC_LANGFUSE_ANALYTICS_EXPORTER_CUTOFF for local testing.
  const ROW_PRE_ANALYTICS_CUTOFF = new Date(
    LEGACY_ANALYTICS_EXPORTER_CUTOFF.getTime() - MS_PER_DAY,
  );
  const ROW_POST_ANALYTICS_CUTOFF = new Date(
    LEGACY_ANALYTICS_EXPORTER_CUTOFF.getTime() + MS_PER_DAY,
  );

  const cloudCtx = (integrationCreatedAt: Date | null): Ctx => ({
    isCloud: true,
    enrichedAvailable: true,
    legacyWritesActive: true,
    // Pre-cutoff project, so only the integration-level gate is in play.
    projectCreatedAt: PROJECT_PRE,
    integrationCreatedAt,
    exporterCutoff: LEGACY_ANALYTICS_EXPORTER_CUTOFF,
  });

  const derive = (
    persisted: AnalyticsIntegrationExportSource | null | undefined,
    ctx: Ctx,
    isBetaEnabled: boolean,
  ) => ({
    show: shouldShowExportSourceField({
      persisted,
      ctx,
      isBetaEnabled,
      options: getExportSourceOptions(persisted ?? null, ctx),
    }),
    defaulted: getDefaultExportSource({ persisted, ctx, isBetaEnabled }),
  });

  it("brand-new Cloud integration: field hidden and default pinned to EVENTS, regardless of the beta opt-in", () => {
    for (const isBetaEnabled of [false, true]) {
      expect(derive(undefined, cloudCtx(null), isBetaEnabled)).toEqual({
        show: false,
        defaulted: AnalyticsIntegrationExportSource.EVENTS,
      });
    }
  });

  it("grandfathered pre-cutoff Cloud integration: field shown without the beta opt-in, default keeps the persisted legacy source", () => {
    const ctx = cloudCtx(ROW_PRE_ANALYTICS_CUTOFF);
    expect(
      derive(AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS, ctx, false),
    ).toEqual({
      show: true,
      defaulted: AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    });
    // The legacy source stays a real choice, so the user can opt into enriched
    // without being forced and without being rewritten.
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        ctx,
      ),
    ).toBe(true);
    expect(
      isExportSourceSelectable(AnalyticsIntegrationExportSource.EVENTS, ctx),
    ).toBe(true);
  });

  it("post-cutoff Cloud integration: field hidden and pinned even with a persisted legacy source", () => {
    const ctx = cloudCtx(ROW_POST_ANALYTICS_CUTOFF);
    expect(
      derive(AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS, ctx, false),
    ).toEqual({
      show: false,
      defaulted: AnalyticsIntegrationExportSource.EVENTS,
    });
  });

  it("self-hosted without the beta opt-in: field hidden, default legacy (unchanged)", () => {
    expect(derive(undefined, selfHostedWithPreview, false)).toEqual({
      show: false,
      defaulted: AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    });
  });

  it("self-hosted with the beta opt-in: field shown, default EVENTS", () => {
    // Guards the self-hosted arm of `isCloud || isBetaEnabled`: making the
    // selector Cloud-unconditional must not have dropped the opt-in path.
    expect(derive(undefined, selfHostedWithPreview, true)).toEqual({
      show: true,
      defaulted: AnalyticsIntegrationExportSource.EVENTS,
    });
  });

  it("self-hosted events_only with a persisted legacy source: field forced visible so the blocked-save alert has a target", () => {
    // Not a cutoff case — capability. Without this arm the user would be left
    // with a blocked save and no control to change.
    expect(
      derive(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        selfHostedEventsOnly,
        false,
      ).show,
    ).toBe(true);
  });
});

describe("getExportSourceUnavailableMessage", () => {
  it("names the write mode for enriched-unavailable (self-hosted operator-facing)", () => {
    const message = getExportSourceUnavailableMessage("enriched-unavailable");
    expect(message).toContain("enriched observations");
    expect(message).toContain("LANGFUSE_MIGRATION_V4_WRITE_MODE=legacy");
    // The preview opt-in no longer affects enriched availability, so pointing
    // an operator at it during a blocked save sends them to a dead end.
    expect(message).not.toContain("preview opt-in");
  });

  it("describes the Cloud cutoff for cloud-cutoff", () => {
    expect(getExportSourceUnavailableMessage("cloud-cutoff")).toContain(
      "no longer available for this project",
    );
  });

  it("names the env var for legacy-writes-disabled (self-hosted operator-facing)", () => {
    const message = getExportSourceUnavailableMessage("legacy-writes-disabled");
    expect(message).toContain("LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only");
    expect(message).not.toContain("no longer available for this project");
  });
});
