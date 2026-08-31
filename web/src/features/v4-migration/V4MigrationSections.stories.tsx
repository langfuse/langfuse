import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import {
  V4MigrationApisSection,
  V4MigrationCustomInstrumentationSection,
  V4MigrationDetectedInstrumentationSection,
  V4MigrationEvalsSection,
  V4MigrationExperimentsSection,
  V4MigrationIntegrationsSection,
  V4MigrationOtelSection,
  V4MigrationSdkSection,
} from "./V4MigrationContent";
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
  const canonicalSdkName =
    overrides.canonicalSdkName !== undefined
      ? overrides.canonicalSdkName
      : sdkName === "python"
        ? "python"
        : sdkName === "javascript" || sdkName.startsWith("@langfuse/")
          ? "javascript"
          : null;
  const sdkVersionMajor =
    overrides.sdkVersionMajor !== undefined
      ? overrides.sdkVersionMajor
      : Number(sdkVersion.match(/^v?(\d+)/)?.[1] ?? NaN);
  const resolvedMajor = Number.isFinite(sdkVersionMajor)
    ? Number(sdkVersionMajor)
    : null;
  const latestMajor =
    canonicalSdkName === "python"
      ? 4
      : canonicalSdkName === "javascript"
        ? 5
        : null;
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

const meta = preview.meta({
  component: V4MigrationSdkSection,
});

export const SdkOutdated = meta.story({
  args: { sdk: sdkOutdatedState, defaultOpen: true },
});

export const UnrecognizedSdkName = meta.story({
  render: () => (
    <V4MigrationCustomInstrumentationSection
      sdk={unrecognizedSdkState}
      defaultOpen
    />
  ),
});

export const SdkChecking = meta.story({
  args: { sdk: makeSdkState({ status: "checking" }), defaultOpen: true },
});

export const SdkCheckFailed = meta.story({
  args: { sdk: makeSdkState({ status: "error" }), defaultOpen: true },
});

export const OtelHeaderRequired = meta.story({
  render: () => (
    <V4MigrationOtelSection sdk={otelHeaderRequiredState} defaultOpen />
  ),
});

export const UpgradeInstrumentation = meta.story({
  render: () => (
    <V4MigrationCustomInstrumentationSection
      sdk={customInstrumentationState}
      defaultOpen
    />
  ),
});

export const DetectedInstrumentation = meta.story({
  render: () => (
    <V4MigrationDetectedInstrumentationSection
      sdk={detectedInstrumentationState}
    />
  ),
});

export const EvalsDeprecated = meta.story({
  render: () => (
    <V4MigrationEvalsSection
      state={{ status: "loaded", count: 3 }}
      assistant={{ onMigrate: fn() }}
      evalsUrl="/project/demo/evals"
      defaultOpen
    />
  ),
});

export const ExperimentsUpdateRequired = meta.story({
  render: () => (
    <V4MigrationExperimentsSection
      state={{ status: "loaded", result: "required" }}
      upgradePath="api"
      defaultOpen
    />
  ),
});

export const ApisDeprecated = meta.story({
  render: () => (
    <V4MigrationApisSection
      state={{ status: "loaded", count: apiUsage.length }}
      usage={apiUsage}
      defaultOpen
    />
  ),
});

export const IntegrationsDeprecated = meta.story({
  render: () => (
    <V4MigrationIntegrationsSection
      state={{ status: "loaded", count: integrations.length }}
      integrations={integrations}
      integrationsUrl="/project/demo/settings/integrations"
      defaultOpen
    />
  ),
});

// Action sections hide when nothing needs action; Detected still surfaces
// compatible SDK / realtime OTel rows with path labels.
export const HiddenWhenClean = meta.story({
  render: () => {
    const sdk = detectedInstrumentationState;
    return (
      <div>
        <V4MigrationSdkSection sdk={sdk} />
        <V4MigrationOtelSection sdk={sdk} />
        <V4MigrationCustomInstrumentationSection sdk={sdk} />
        <V4MigrationDetectedInstrumentationSection sdk={sdk} />
      </div>
    );
  },
});

export const VariantMatrix = meta.story({
  render: () => (
    <div className="flex max-w-xl flex-col gap-8">
      {(
        [
          [
            "1. SDK outdated (mixed rows)",
            <V4MigrationSdkSection
              key="1"
              sdk={sdkOutdatedState}
              defaultOpen
            />,
          ],
          [
            "2. Unrecognized SDK name (renders as custom instrumentation)",
            <V4MigrationCustomInstrumentationSection
              key="2"
              sdk={unrecognizedSdkState}
              defaultOpen
            />,
          ],
          [
            "3. SDK checking",
            <V4MigrationSdkSection
              key="3"
              sdk={makeSdkState({ status: "checking" })}
              defaultOpen
            />,
          ],
          [
            "4. SDK check failed",
            <V4MigrationSdkSection
              key="4"
              sdk={makeSdkState({ status: "error" })}
              defaultOpen
            />,
          ],
          [
            "5. OTel header required (delayed exporters only)",
            <V4MigrationOtelSection
              key="5"
              sdk={otelHeaderRequiredState}
              defaultOpen
            />,
          ],
          [
            "6. Upgrade Instrumentation (ingestion API without SDK header)",
            <V4MigrationCustomInstrumentationSection
              key="6"
              sdk={customInstrumentationState}
              defaultOpen
            />,
          ],
          [
            "7. Detected V4-compatible instrumentation (compatible SDK + realtime OTel)",
            <V4MigrationDetectedInstrumentationSection
              key="7"
              sdk={detectedInstrumentationState}
            />,
          ],
          [
            "8. Evals deprecated (assistant can migrate)",
            <V4MigrationEvalsSection
              key="8"
              state={{ status: "loaded", count: 3 }}
              assistant={{ onMigrate: fn() }}
              evalsUrl="/project/demo/evals"
              defaultOpen
            />,
          ],
          [
            "9. Evals deprecated, single (assistant plans the order, no auto-migrate)",
            <V4MigrationEvalsSection
              key="9"
              state={{ status: "loaded", count: 1 }}
              assistant={{ onMigrate: fn() }}
              evalsUrl="/project/demo/evals"
              defaultOpen
            />,
          ],
          [
            "10. Experiments update required (deprecated API call)",
            <V4MigrationExperimentsSection
              key="10"
              state={{ status: "loaded", result: "required" }}
              upgradePath="api"
              defaultOpen
            />,
          ],
          [
            "11. Experiments update required (outdated SDK)",
            <V4MigrationExperimentsSection
              key="11"
              state={{ status: "loaded", result: "required" }}
              upgradePath="sdk"
              defaultOpen
            />,
          ],
          [
            "12. Experiments needs review (inconclusive SDK usage)",
            <V4MigrationExperimentsSection
              key="12"
              state={{ status: "loaded", result: "sdk_usage_inconclusive" }}
              upgradePath="sdk"
              defaultOpen
            />,
          ],
          [
            "13. Deprecated APIs called",
            <V4MigrationApisSection
              key="13"
              state={{ status: "loaded", count: apiUsage.length }}
              usage={apiUsage}
              defaultOpen
            />,
          ],
          [
            "14. Deprecated integrations exporting",
            <V4MigrationIntegrationsSection
              key="14"
              state={{ status: "loaded", count: integrations.length }}
              integrations={integrations}
              integrationsUrl="/project/demo/settings/integrations"
              defaultOpen
            />,
          ],
          [
            "15. Checker still loading (evals shown; same chip on all checkers)",
            <V4MigrationEvalsSection
              key="15"
              state={{ status: "loading", count: 0 }}
              assistant={null}
              defaultOpen
            />,
          ],
          [
            "16. Checker failed (evals shown; same chip on all checkers)",
            <V4MigrationEvalsSection
              key="16"
              state={{ status: "error", count: 0 }}
              assistant={null}
              defaultOpen
            />,
          ],
          [
            "17. Clean sections collapse into one summary line",
            <p key="17" className="text-muted-foreground py-1.5 text-sm">
              Evals, experiments, APIs and integrations are up to date.
            </p>,
          ],
          [
            "18. Everything at once",
            <div key="18">
              <V4MigrationSdkSection sdk={combinedState} defaultOpen />
              <V4MigrationOtelSection sdk={combinedState} defaultOpen />
              <V4MigrationCustomInstrumentationSection
                sdk={combinedState}
                defaultOpen
              />
              <V4MigrationDetectedInstrumentationSection sdk={combinedState} />
              <V4MigrationEvalsSection
                state={{ status: "loaded", count: 2 }}
                assistant={{ onMigrate: fn() }}
                evalsUrl="/project/demo/evals"
                defaultOpen
              />
              <V4MigrationExperimentsSection
                state={{ status: "loaded", result: "required" }}
                upgradePath="api"
                defaultOpen
              />
              <V4MigrationApisSection
                state={{ status: "loaded", count: apiUsage.length }}
                usage={apiUsage}
                defaultOpen
              />
              <V4MigrationIntegrationsSection
                state={{ status: "loaded", count: integrations.length }}
                integrations={integrations}
                integrationsUrl="/project/demo/settings/integrations"
                defaultOpen
              />
            </div>,
          ],
        ] as const
      ).map(([label, node]) => (
        <div key={label} className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            {label}
          </p>
          {node}
        </div>
      ))}
    </div>
  ),
});
