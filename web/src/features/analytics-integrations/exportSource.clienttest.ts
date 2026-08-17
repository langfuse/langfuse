import {
  AnalyticsIntegrationExportSource,
  LEGACY_BLOB_EXPORT_CUTOFF,
  LEGACY_BLOB_EXPORTER_CUTOFF,
  type BlobExportWriteMode,
  type ExportSourceContext,
} from "@langfuse/shared";

import {
  buildExportSourceContext,
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

describe("getExportSourceFormValue", () => {
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
