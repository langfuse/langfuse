// @vitest-environment node

import {
  AnalyticsIntegrationExportSource,
  LEGACY_ANALYTICS_EXPORTER_CUTOFF,
  LEGACY_EXPORT_PROJECT_CUTOFF,
  LEGACY_BLOB_EXPORTER_CUTOFF,
  type V4WriteMode,
  type ExportSourceContext,
} from "@langfuse/shared";

import {
  buildExportSourceContext,
  getExportSourceFieldState,
  getExportSourceFormValue,
  getExportSourceOptions,
  getExportSourceUnavailableMessage,
  isExportSourceSelectable,
  shouldHideExportSourceSelector,
} from "./exportSource";

// UI-adapter tests. The policy matrix itself lives with the policy
// (packages/shared/.../export-source-policy.test.ts); these cover the
// option-list/form-value/alert derivations on representative contexts.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PROJECT_PRE = new Date(
  LEGACY_EXPORT_PROJECT_CUTOFF.getTime() - MS_PER_DAY,
);
const PROJECT_POST = new Date(
  LEGACY_EXPORT_PROJECT_CUTOFF.getTime() + MS_PER_DAY,
);
const ROW_PRE = new Date(LEGACY_BLOB_EXPORTER_CUTOFF.getTime() - MS_PER_DAY);

// Self-hosted unless a case overrides it, so the two capability flags always
// come from the real builder rather than being hand-set per case.
const ctxFor = (
  writeMode: V4WriteMode,
  over: Partial<
    Omit<ExportSourceContext, "enrichedAvailable" | "legacyWritesActive">
  > = {},
): ExportSourceContext =>
  buildExportSourceContext({ writeMode, isCloud: false, ...over });

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
// Self-hosted events_only: v3 tables no longer written. Enriched
// stays available (events_only requires the V4 preview opt-in).
const selfHostedEventsOnly: ExportSourceContext = {
  isCloud: false,
  enrichedAvailable: true,
  legacyWritesActive: false,
};

describe("getExportSourceFormValue", () => {
  it("keeps any persisted value regardless of deployment state", () => {
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

  it("defaults new configurations to EVENTS on events_only, keeps a persisted legacy value", () => {
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

  it("rejects legacy sources on events_only, EVENTS stays", () => {
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

  it("marks a persisted legacy source unavailable on events_only, EVENTS selectable", () => {
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

  it("includes a stale persisted enriched source, marked unavailable", () => {
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
  const WRITE_MODES: V4WriteMode[] = ["legacy", "dual", "events_only"];

  const selectableValues = (ctx: ExportSourceContext) =>
    getExportSourceOptions(undefined, ctx)
      .filter((o) => !o.unavailable)
      .map((o) => o.value);

  const offered: Array<[V4WriteMode, AnalyticsIntegrationExportSource[]]> = [
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

  const defaults: Array<[V4WriteMode, AnalyticsIntegrationExportSource]> = [
    ["legacy", AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS],
    ["dual", AnalyticsIntegrationExportSource.EVENTS],
    ["events_only", AnalyticsIntegrationExportSource.EVENTS],
  ];

  // The create default comes from the shared policy's defaultExportSource, so
  // the settings page, the tRPC routers and the public REST API all land the
  // same source. Its own matrix lives in export-source-policy.test.ts.
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
    [V4WriteMode, AnalyticsIntegrationExportSource]
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

// The pages consume only this composite, so the pieces being correct
// individually is not enough — visibility and the default must agree.
describe("getExportSourceFieldState", () => {
  it.each<V4WriteMode>(["legacy", "dual", "events_only"])(
    "%s: a hidden selector always leaves a selectable default",
    (mode) => {
      const ctx = ctxFor(mode);
      const { showField, defaultValue } = getExportSourceFieldState(
        undefined,
        ctx,
      );
      if (!showField) {
        expect(isExportSourceSelectable(defaultValue, ctx)).toBe(true);
      }
    },
  );

  it("dual offers the choice, with the events source defaulted", () => {
    const { showField, defaultValue, options } = getExportSourceFieldState(
      undefined,
      ctxFor("dual"),
    );
    expect(showField).toBe(true);
    expect(options).toHaveLength(3);
    expect(defaultValue).toBe(AnalyticsIntegrationExportSource.EVENTS);
  });

  it.each<[V4WriteMode, AnalyticsIntegrationExportSource]>([
    ["legacy", AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS],
    ["events_only", AnalyticsIntegrationExportSource.EVENTS],
  ])("%s hides the selector and defaults to %s", (mode, expected) => {
    const { showField, defaultValue } = getExportSourceFieldState(
      undefined,
      ctxFor(mode),
    );
    expect(showField).toBe(false);
    expect(defaultValue).toBe(expected);
  });

  // Kept as the default even though unselectable: the blocked-save alert
  // names it.
  it("keeps the selector for a persisted source the deployment can no longer write", () => {
    const ctx = ctxFor("events_only");
    const { showField, defaultValue } = getExportSourceFieldState(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      ctx,
    );
    expect(showField).toBe(true);
    expect(defaultValue).toBe(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    );
    expect(isExportSourceSelectable(defaultValue, ctx)).toBe(false);
  });

  it("post-cutoff Cloud leaves only the events source to offer", () => {
    const { showField, defaultValue } = getExportSourceFieldState(
      undefined,
      ctxFor("dual", {
        isCloud: true,
        projectCreatedAt: PROJECT_POST,
        integrationCreatedAt: ROW_PRE,
      }),
    );
    expect(showField).toBe(false);
    expect(defaultValue).toBe(AnalyticsIntegrationExportSource.EVENTS);
  });

  // The cutoff gates newly chosen sources only. Hiding the field and pinning
  // the events source instead would rewrite a persisted legacy source on the
  // next save of any other field on the page.
  it("post-cutoff Cloud keeps a persisted legacy source visible and blocked", () => {
    const ctx = ctxFor("dual", {
      isCloud: true,
      projectCreatedAt: PROJECT_POST,
      integrationCreatedAt: ROW_PRE,
    });
    const { showField, defaultValue, options } = getExportSourceFieldState(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      ctx,
    );
    expect(showField).toBe(true);
    expect(defaultValue).toBe(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    );
    expect(isExportSourceSelectable(defaultValue, ctx)).toBe(false);
    expect(options.find((o) => o.value === defaultValue)?.unavailable).toBe(
      true,
    );
  });

  // Pre-cutoff projects are exempt from the cutoff, leaving only the write
  // mode.
  it.each<V4WriteMode>(["legacy", "dual", "events_only"])(
    "%s: pre-cutoff Cloud matches self-hosted",
    (mode) => {
      expect(
        getExportSourceFieldState(
          undefined,
          ctxFor(mode, {
            isCloud: true,
            projectCreatedAt: PROJECT_PRE,
            integrationCreatedAt: ROW_PRE,
          }),
        ),
      ).toEqual(getExportSourceFieldState(undefined, ctxFor(mode)));
    },
  );
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

// Mirrors the context the analytics settings pages build. Row ages derive from
// the constant, never from literals: it is overridable via
// NEXT_PUBLIC_LANGFUSE_ANALYTICS_EXPORTER_CUTOFF.
describe("analytics settings pages: the new-integration enriched pin", () => {
  const ROW_PRE_ANALYTICS = new Date(
    LEGACY_ANALYTICS_EXPORTER_CUTOFF.getTime() - MS_PER_DAY,
  );
  const ROW_POST_ANALYTICS = new Date(
    LEGACY_ANALYTICS_EXPORTER_CUTOFF.getTime() + MS_PER_DAY,
  );

  const analyticsCloudCtx = (
    integrationCreatedAt: Date | null,
  ): ExportSourceContext =>
    buildExportSourceContext({
      writeMode: "dual",
      isCloud: true,
      // Pre-cutoff project, so the only Cloud gate in play is the
      // integration-level one.
      projectCreatedAt: PROJECT_PRE,
      integrationCreatedAt,
      exporterCutoff: LEGACY_ANALYTICS_EXPORTER_CUTOFF,
    });

  it("brand-new Cloud integration: selector hidden, pinned to the enriched source", () => {
    const { showField, defaultValue, options } = getExportSourceFieldState(
      undefined,
      analyticsCloudCtx(null),
    );
    expect(showField).toBe(false);
    expect(defaultValue).toBe(AnalyticsIntegrationExportSource.EVENTS);
    // Hidden because there is nothing left to choose, not because the choice
    // was suppressed.
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.EVENTS,
    ]);
  });

  it("grandfathered pre-cutoff Cloud integration: selector shown, legacy source kept and still selectable", () => {
    const ctx = analyticsCloudCtx(ROW_PRE_ANALYTICS);
    const { showField, defaultValue } = getExportSourceFieldState(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      ctx,
    );
    expect(showField).toBe(true);
    expect(defaultValue).toBe(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    );
    // A real choice: opting into enriched is offered, never forced.
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

  it("post-cutoff Cloud integration on a legacy source: selector forced visible, source kept, never rewritten", () => {
    // Reachable: a Cloud row created after the cutoff date but before this gate
    // shipped still carries the legacy source. Pinning the form value to the
    // enriched source here would change what it exports on the next save of any
    // unrelated field.
    const ctx = analyticsCloudCtx(ROW_POST_ANALYTICS);
    const { showField, defaultValue, options } = getExportSourceFieldState(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      ctx,
    );
    expect(showField).toBe(true);
    expect(defaultValue).toBe(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    );
    // Kept, but blocked — the save must fail rather than substitute a source.
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        ctx,
      ),
    ).toBe(false);
    expect(
      options.find(
        (o) => o.value === AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      )?.unavailable,
    ).toBe(true);
  });

  it("a grandfathered row already on enriched still offers the way back to legacy", () => {
    // The UI half of the reversibility guarantee: hiding the selector once the
    // row sits on enriched would leave the escape hatch API-only.
    const { showField, options } = getExportSourceFieldState(
      AnalyticsIntegrationExportSource.EVENTS,
      analyticsCloudCtx(ROW_PRE_ANALYTICS),
    );
    expect(showField).toBe(true);
    expect(
      options.find(
        (o) => o.value === AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      ),
    ).toMatchObject({ unavailable: false });
  });
});
