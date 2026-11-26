/* eslint-disable no-nested-ternary */
import { expect, fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { Separator } from "@/src/components/ui/separator";
import { V4MigrationChecklist } from "./V4MigrationChecklist";
import { V4MigrationHeaderContent } from "./V4MigrationContent";
import {
  type V4MigrationSdkState,
  type V4MigrationSdkUsageSeries,
} from "./sdkVersionStatus";

const HOUR_MS = 60 * 60 * 1000;

const makeSeries = (
  overrides: Partial<V4MigrationSdkUsageSeries> = {},
): V4MigrationSdkUsageSeries => {
  const source = overrides.source ?? "ingestion-api-dual-write";
  const ingestionPath =
    overrides.ingestionPath ??
    (source === "ingestion-api-dual-write" ? "ingestion_api" : "otel");
  const deliveryMode =
    overrides.deliveryMode ?? (source === "otel" ? "realtime" : "delayed");
  const sdkName = overrides.sdkName ?? "python";
  const sdkVersion = overrides.sdkVersion ?? "4.7.1";
  const canonicalSdkName = (() => {
    if (overrides.canonicalSdkName !== undefined) {
      return overrides.canonicalSdkName;
    }
    if (sdkName === "python") {
      return "python";
    }
    if (sdkName === "javascript" || sdkName.startsWith("@langfuse/")) {
      return "javascript";
    }
    return null;
  })();
  const sdkVersionMajor =
    overrides.sdkVersionMajor !== undefined
      ? overrides.sdkVersionMajor
      : Number(sdkVersion.match(/^v?(\d+)/)?.[1] ?? NaN);
  const resolvedMajor = Number.isFinite(sdkVersionMajor)
    ? Number(sdkVersionMajor)
    : null;
  const latestMajor = (() => {
    if (canonicalSdkName === "python") {
      return 4;
    }
    if (canonicalSdkName === "javascript") {
      return 5;
    }
    return null;
  })();
  const v4MigrationStatus =
    overrides.v4MigrationStatus ??
    (canonicalSdkName === null || resolvedMajor === null
      ? "unknown"
      : resolvedMajor >= (latestMajor ?? 0)
        ? "compatible"
        : "upgrade_required");
  const remediationType =
    overrides.remediationType ??
    (canonicalSdkName !== null
      ? "update_sdk"
      : ingestionPath === "otel"
        ? "update_otel_instrumentation"
        : "upgrade_instrumentation");
  const actionLevel =
    overrides.actionLevel ??
    (remediationType === "update_sdk"
      ? v4MigrationStatus === "compatible"
        ? "none"
        : "required"
      : remediationType === "update_otel_instrumentation"
        ? deliveryMode === "realtime"
          ? "none"
          : "required"
        : "required");

  return {
    source,
    ingestionPath,
    deliveryMode,
    sdkName,
    sdkVersion,
    canonicalSdkName,
    sdkVersionMajor: resolvedMajor,
    latestSdkMajor:
      overrides.latestSdkMajor !== undefined
        ? overrides.latestSdkMajor
        : latestMajor,
    isValidSdkVersion: overrides.isValidSdkVersion ?? resolvedMajor !== null,
    publicKey: overrides.publicKey ?? "pk-lf-1234567890abcdef",
    eventCount: overrides.eventCount ?? 10,
    firstSeen:
      overrides.firstSeen ?? new Date(Date.now() - 72 * HOUR_MS).toISOString(),
    lastSeen:
      overrides.lastSeen ?? new Date(Date.now() - 19 * HOUR_MS).toISOString(),
    attributionStatus: overrides.attributionStatus ?? "attributed",
    v4MigrationStatus,
    remediationType,
    actionLevel,
  };
};

const makeSdkState = (
  overrides: Partial<V4MigrationSdkState>,
): V4MigrationSdkState => ({
  status: "latest",
  sdkUsageSeries: [],
  upgradeRequiredCount: 0,
  delayedOtelIngestionCount: 0,
  ...overrides,
});

const outdatedPython = makeSeries({
  sdkVersion: "2.60.3",
});
// Series with no observation evidence: the key renders as plain text, not a link.
const scoresOnlyPython = makeSeries({
  sdkVersion: "2.44.0",
  publicKey: "pk-lf-scores-only-0001",
  eventCount: 0,
});
const outdatedJavascript = makeSeries({
  sdkName: "javascript",
  sdkVersion: "3.38.5",
  canonicalSdkName: "javascript",
  publicKey: "pk-lf-fedcba0987654321",
});
const compatiblePython = makeSeries({
  sdkVersion: "4.6.9",
  publicKey: "pk-lf-compatible-0001",
  lastSeen: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
});
const unrecognizedSdk = makeSeries({
  sdkName: "my-custom-wrapper",
  sdkVersion: "0.4.0",
  canonicalSdkName: null,
  publicKey: "pk-lf-4444555566667777",
});
const delayedOtelExporter = makeSeries({
  source: "otel-dual-write",
  sdkName: "openlit",
  sdkVersion: "1.35.4",
  canonicalSdkName: null,
  publicKey: "pk-lf-aaaa000011112222",
  lastSeen: new Date(Date.now() - 0.25 * HOUR_MS).toISOString(),
});
const unnamedDelayedOtelExporter = makeSeries({
  source: "otel-dual-write",
  sdkName: "unknown",
  sdkVersion: "unknown",
  canonicalSdkName: null,
  publicKey: "pk-lf-8888999900001111",
});
const realtimeOtelExporter = makeSeries({
  source: "otel",
  sdkName: "otelcol",
  sdkVersion: "0.98.0",
  canonicalSdkName: null,
  publicKey: "pk-lf-bbbb333344445555",
  lastSeen: new Date(Date.now() - 70 * HOUR_MS).toISOString(),
});
// Ingestion-API traffic without a Langfuse SDK header: custom instrumentation
// or an SDK too old to send attribution headers.
const customInstrumentation = makeSeries({
  source: "ingestion-api-dual-write",
  sdkName: "unknown",
  sdkVersion: "unknown",
  canonicalSdkName: null,
  attributionStatus: "missing_name_and_version",
  publicKey: "pk-lf-cccc666677778888",
});

const sdkOutdatedState = makeSdkState({
  status: "legacy",
  sdkUsageSeries: [
    compatiblePython,
    outdatedPython,
    scoresOnlyPython,
    outdatedJavascript,
  ],
  upgradeRequiredCount: 3,
});

// An unrecognized SDK name is custom instrumentation, not an SDK state.
const unrecognizedSdkState = makeSdkState({
  status: "unknown",
  sdkUsageSeries: [makeSeries({}), unrecognizedSdk],
});

const otelHeaderRequiredState = makeSdkState({
  status: "otel_header_required",
  sdkUsageSeries: [
    delayedOtelExporter,
    unnamedDelayedOtelExporter,
    realtimeOtelExporter,
  ],
  delayedOtelIngestionCount: 2,
});

const customInstrumentationState = makeSdkState({
  status: "unknown",
  sdkUsageSeries: [customInstrumentation],
});

const migratedKey = "pk-lf-1234567890a5016c";
const migratedLegacy = makeSeries({
  sdkVersion: "2.60.3",
  publicKey: migratedKey,
  lastSeen: new Date(Date.now() - 7 * HOUR_MS).toISOString(),
});
const migratedSuccessor = makeSeries({
  sdkVersion: "4.7.1",
  publicKey: migratedKey,
  source: "otel",
  ingestionPath: "otel",
  deliveryMode: "realtime",
  lastSeen: new Date(Date.now() - HOUR_MS).toISOString(),
});
const migratedKeysState = makeSdkState({
  status: "legacy",
  sdkUsageSeries: [migratedLegacy, migratedSuccessor],
  upgradeRequiredCount: 1,
});

const migratedKeyB = "pk-lf-abcdef123456b7021d";
const actionNeededOnlyState = makeSdkState({
  status: "legacy",
  sdkUsageSeries: [
    makeSeries({
      sdkVersion: "2.60.3",
      publicKey: "pk-lf-1111222233334444",
      lastSeen: new Date(Date.now() - 5 * HOUR_MS).toISOString(),
    }),
    makeSeries({
      source: "otel-dual-write",
      sdkName: "openlit",
      sdkVersion: "1.35.4",
      canonicalSdkName: null,
      publicKey: "pk-lf-aaaa000011112222",
      lastSeen: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
    }),
  ],
  upgradeRequiredCount: 1,
  delayedOtelIngestionCount: 1,
});

const mixedMigrationState = makeSdkState({
  status: "legacy",
  sdkUsageSeries: [
    makeSeries({
      sdkVersion: "2.60.3",
      publicKey: migratedKey,
      lastSeen: new Date(Date.now() - 7 * HOUR_MS).toISOString(),
    }),
    makeSeries({
      sdkVersion: "4.7.1",
      publicKey: migratedKey,
      source: "otel",
      ingestionPath: "otel",
      deliveryMode: "realtime",
      lastSeen: new Date(Date.now() - HOUR_MS).toISOString(),
    }),
    makeSeries({
      sdkName: "javascript",
      sdkVersion: "3.38.5",
      canonicalSdkName: "javascript",
      publicKey: migratedKeyB,
      lastSeen: new Date(Date.now() - 9 * HOUR_MS).toISOString(),
    }),
    makeSeries({
      sdkName: "javascript",
      sdkVersion: "5.1.0",
      canonicalSdkName: "javascript",
      publicKey: migratedKeyB,
      source: "otel",
      ingestionPath: "otel",
      deliveryMode: "realtime",
      lastSeen: new Date(Date.now() - 3 * HOUR_MS).toISOString(),
    }),
    makeSeries({
      sdkVersion: "2.44.0",
      publicKey: "pk-lf-still-needs-action",
      lastSeen: new Date(Date.now() - 4 * HOUR_MS).toISOString(),
    }),
    makeSeries({
      source: "otel-dual-write",
      sdkName: "openlit",
      sdkVersion: "1.35.4",
      canonicalSdkName: null,
      publicKey: "pk-lf-otel-still-delayed",
      lastSeen: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
    }),
  ],
  upgradeRequiredCount: 3,
  delayedOtelIngestionCount: 1,
});

const detectedInstrumentationState = makeSdkState({
  status: "latest",
  sdkUsageSeries: [makeSeries({}), realtimeOtelExporter],
});

const combinedState = makeSdkState({
  status: "legacy",
  sdkUsageSeries: [
    outdatedPython,
    delayedOtelExporter,
    realtimeOtelExporter,
    customInstrumentation,
    makeSeries({}),
  ],
  upgradeRequiredCount: 1,
  delayedOtelIngestionCount: 1,
});

const apiUsage = [
  {
    endpoint: "GET /api/public/traces/{id}",
    count: 1296,
    lastSeen: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
    callers: [
      {
        sdkName: "python" as const,
        sdkVersion: "3.9.0",
        userAgent: "langfuse-python/3.9.0",
        count: 1281,
        lastSeen: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
      },
      {
        userAgent: "codex-cli/1.2.3",
        count: 3,
        lastSeen: new Date(Date.now() - 5 * HOUR_MS).toISOString(),
      },
      {
        isOther: true as const,
        count: 12,
        lastSeen: new Date(Date.now() - 6 * HOUR_MS).toISOString(),
      },
    ],
  },
  {
    endpoint: "GET /api/public/v2/scores",
    count: 42,
    lastSeen: new Date(Date.now() - 26 * HOUR_MS).toISOString(),
    callers: [
      {
        sdkName: "javascript" as const,
        sdkVersion: "5.4.0",
        userAgent: "langfuse-js/5.4.0",
        count: 42,
        lastSeen: new Date(Date.now() - 26 * HOUR_MS).toISOString(),
      },
    ],
  },
];

const integrations = ["PostHog", "Mixpanel", "Blob Storage"];

const cleanData: Parameters<typeof V4MigrationChecklist>[0]["migrationData"] = {
  sdk: detectedInstrumentationState,
  evals: { status: "loaded", count: 0 },
  experiments: { status: "loaded", result: "not_required" },
  experimentInstrumentationUpgradePath: null,
  apis: { status: "loaded", count: 0 },
  exports: { status: "loaded", count: 0 },
  apiUsage: [],
  legacyIntegrations: [],
};

function MigrationPanelPreview({
  sdk,
  remainingActionsAreMigrated = false,
}: {
  sdk: V4MigrationSdkState;
  remainingActionsAreMigrated?: boolean;
}) {
  return (
    <div className="bg-background w-[520px]">
      <div className="px-4 pt-4">
        <V4MigrationHeaderContent
          readiness="action-needed"
          remainingActionsAreMigrated={remainingActionsAreMigrated}
        />
      </div>
      <div className="flex flex-col gap-1 px-4 pt-6 pb-8">
        <Separator />
        <div className="flex items-center gap-2 pt-4 text-base font-bold">
          Action items
        </div>
        <p className="text-muted-foreground text-sm">
          SDK, instrumentation, experiment, and API checks cover activity from
          the last 3 days.
        </p>
        <V4MigrationChecklist
          migrationData={{ ...cleanData, sdk }}
          assistant={null}
          defaultOpen
        />
      </div>
    </div>
  );
}

const meta = preview.meta({
  component: V4MigrationChecklist,
  args: {
    assistant: { onMigrate: fn() },
    evalsUrl: "/project/demo/evals",
    integrationsUrl: "/project/demo/settings/integrations",
    defaultOpen: true,
  },
});

export const PanelActionNeeded = meta.story({
  render: () => <MigrationPanelPreview sdk={actionNeededOnlyState} />,
});

export const PanelMixed = meta.story({
  render: () => <MigrationPanelPreview sdk={mixedMigrationState} />,
});

export const PanelMigrated = meta.story({
  render: () => (
    <MigrationPanelPreview
      sdk={migratedKeysState}
      remainingActionsAreMigrated
    />
  ),
});

export const SdkOutdated = meta.story({
  args: { migrationData: { ...cleanData, sdk: sdkOutdatedState } },
});
export const UnrecognizedSdkName = meta.story({
  args: { migrationData: { ...cleanData, sdk: unrecognizedSdkState } },
});
export const SdkChecking = meta.story({
  args: {
    migrationData: { ...cleanData, sdk: makeSdkState({ status: "checking" }) },
  },
});
export const SdkCheckFailed = meta.story({
  args: {
    migrationData: { ...cleanData, sdk: makeSdkState({ status: "error" }) },
  },
});
export const OtelHeaderRequired = meta.story({
  args: { migrationData: { ...cleanData, sdk: otelHeaderRequiredState } },
});
export const UpgradeInstrumentation = meta.story({
  args: { migrationData: { ...cleanData, sdk: customInstrumentationState } },
});
export const HiddenWhenClean = meta.story({
  name: "(Test) Hidden When Clean",
  args: { migrationData: cleanData },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "Evals, experiments, APIs and integrations are up to date.",
      ),
    ).toBeVisible();
    await expect(canvas.queryByText("Update Evals")).not.toBeInTheDocument();
  },
});
export const EvalsDeprecated = meta.story({
  args: {
    migrationData: { ...cleanData, evals: { status: "loaded", count: 3 } },
  },
});
export const SingleEvalDeprecated = meta.story({
  args: {
    migrationData: { ...cleanData, evals: { status: "loaded", count: 1 } },
  },
});
export const ExperimentsUpdateRequired = meta.story({
  args: {
    migrationData: {
      ...cleanData,
      experiments: { status: "loaded", result: "required" },
      experimentInstrumentationUpgradePath: "api",
    },
  },
});
export const ExperimentsSdkUpdateRequired = meta.story({
  args: {
    migrationData: {
      ...cleanData,
      experiments: { status: "loaded", result: "required" },
      experimentInstrumentationUpgradePath: "sdk",
    },
  },
});
export const ExperimentsNeedsReview = meta.story({
  args: {
    migrationData: {
      ...cleanData,
      experiments: { status: "loaded", result: "sdk_usage_inconclusive" },
      experimentInstrumentationUpgradePath: "sdk",
    },
  },
});
export const ApisDeprecated = meta.story({
  args: {
    migrationData: {
      ...cleanData,
      apis: { status: "loaded", count: apiUsage.length },
      apiUsage,
    },
  },
});
export const IntegrationsDeprecated = meta.story({
  args: {
    migrationData: {
      ...cleanData,
      exports: { status: "loaded", count: integrations.length },
      legacyIntegrations: integrations,
    },
  },
});
export const EvalCheckLoading = meta.story({
  args: {
    assistant: null,
    migrationData: { ...cleanData, evals: { status: "loading", count: 0 } },
  },
});
export const EvalCheckFailed = meta.story({
  args: {
    assistant: null,
    migrationData: { ...cleanData, evals: { status: "error", count: 0 } },
  },
});
export const EverythingAtOnce = meta.story({
  args: {
    migrationData: {
      ...cleanData,
      sdk: combinedState,
      evals: { status: "loaded", count: 2 },
      experiments: { status: "loaded", result: "required" },
      experimentInstrumentationUpgradePath: "api",
      apis: { status: "loaded", count: apiUsage.length },
      apiUsage,
      exports: { status: "loaded", count: integrations.length },
      legacyIntegrations: integrations,
    },
  },
});
