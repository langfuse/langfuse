import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import {
  V4MigrationApisSection,
  V4MigrationCustomInstrumentationSection,
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
  overrides: Partial<V4MigrationSdkUsageSeries>,
): V4MigrationSdkUsageSeries => ({
  sdkName: "python",
  sdkVersion: "4.7.1",
  canonicalSdkName: "python",
  publicKey: "pk-lf-1234567890abcdef",
  count: 10,
  eventsCount: 10,
  firstSeen: new Date(Date.now() - 72 * HOUR_MS).toISOString(),
  lastSeen: new Date(Date.now() - 19 * HOUR_MS).toISOString(),
  hasDelayedOtelEvents: null,
  attributionStatus: "attributed",
  v4MigrationStatus: "compatible",
  upgradeCompleted: false,
  ...overrides,
});

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
  v4MigrationStatus: "upgrade_required",
});
const outdatedJavascript = makeSeries({
  sdkName: "javascript",
  sdkVersion: "3.38.5",
  canonicalSdkName: "javascript",
  v4MigrationStatus: "upgrade_required",
  publicKey: "pk-lf-fedcba0987654321",
});
const upgradedPython = makeSeries({
  v4MigrationStatus: "upgrade_required",
  upgradeCompleted: true,
  publicKey: "pk-lf-0000111122223333",
  lastSeen: new Date(Date.now() - 0.25 * HOUR_MS).toISOString(),
});
const unrecognizedSdk = makeSeries({
  sdkName: "my-custom-wrapper",
  sdkVersion: "0.4.0",
  canonicalSdkName: null,
  v4MigrationStatus: "unknown",
  publicKey: "pk-lf-4444555566667777",
});
const delayedOtelExporter = makeSeries({
  sdkName: "openlit",
  sdkVersion: "1.35.4",
  canonicalSdkName: null,
  v4MigrationStatus: "unknown",
  hasDelayedOtelEvents: true,
  publicKey: "pk-lf-aaaa000011112222",
  lastSeen: new Date(Date.now() - 0.25 * HOUR_MS).toISOString(),
});
const unnamedDelayedOtelExporter = makeSeries({
  sdkName: "unknown",
  sdkVersion: "unknown",
  canonicalSdkName: null,
  v4MigrationStatus: "unknown",
  hasDelayedOtelEvents: true,
  publicKey: "pk-lf-8888999900001111",
});
const realtimeOtelExporter = makeSeries({
  sdkName: "otelcol",
  sdkVersion: "0.98.0",
  canonicalSdkName: null,
  v4MigrationStatus: "unknown",
  hasDelayedOtelEvents: false,
  publicKey: "pk-lf-bbbb333344445555",
  lastSeen: new Date(Date.now() - 70 * HOUR_MS).toISOString(),
});
// Ingestion-API traffic without a Langfuse SDK header: custom instrumentation
// or an SDK too old to send attribution headers.
const customInstrumentation = makeSeries({
  sdkName: "unknown",
  sdkVersion: "unknown",
  canonicalSdkName: null,
  attributionStatus: "missing_name_and_version",
  v4MigrationStatus: "unknown",
  hasDelayedOtelEvents: null,
  publicKey: "pk-lf-cccc666677778888",
});

const sdkOutdatedState = makeSdkState({
  status: "legacy",
  sdkUsageSeries: [outdatedPython, outdatedJavascript, upgradedPython],
  upgradeRequiredCount: 2,
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

const combinedState = makeSdkState({
  status: "legacy",
  sdkUsageSeries: [
    outdatedPython,
    upgradedPython,
    delayedOtelExporter,
    realtimeOtelExporter,
    customInstrumentation,
  ],
  upgradeRequiredCount: 1,
  delayedOtelIngestionCount: 1,
});

const apiUsage = [
  {
    endpoint: "GET /api/public/traces",
    count: 1284,
    lastSeen: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
  },
  {
    endpoint: "POST /api/public/scores",
    count: 42,
    lastSeen: new Date(Date.now() - 26 * HOUR_MS).toISOString(),
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

// All sections hide themselves when nothing needs action; the empty output
// here is the intended state, not a broken story.
export const HiddenWhenClean = meta.story({
  render: () => {
    const sdk = makeSdkState({
      sdkUsageSeries: [makeSeries({}), realtimeOtelExporter],
    });
    return (
      <div>
        <V4MigrationSdkSection sdk={sdk} />
        <V4MigrationOtelSection sdk={sdk} />
        <V4MigrationCustomInstrumentationSection sdk={sdk} />
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
            "5. OTel header required (delayed, unnamed, real-time exporters)",
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
            "7. Evals deprecated (assistant can migrate)",
            <V4MigrationEvalsSection
              key="7"
              state={{ status: "loaded", count: 3 }}
              assistant={{ onMigrate: fn() }}
              evalsUrl="/project/demo/evals"
              defaultOpen
            />,
          ],
          [
            "8. Evals deprecated, single (assistant plans the order, no auto-migrate)",
            <V4MigrationEvalsSection
              key="8"
              state={{ status: "loaded", count: 1 }}
              assistant={{ onMigrate: fn() }}
              evalsUrl="/project/demo/evals"
              defaultOpen
            />,
          ],
          [
            "9. Experiments update required (deprecated API call)",
            <V4MigrationExperimentsSection
              key="9"
              state={{ status: "loaded", result: "required" }}
              upgradePath="api"
              defaultOpen
            />,
          ],
          [
            "10. Experiments update required (outdated SDK)",
            <V4MigrationExperimentsSection
              key="10"
              state={{ status: "loaded", result: "required" }}
              upgradePath="sdk"
              defaultOpen
            />,
          ],
          [
            "11. Experiments needs review (inconclusive SDK usage)",
            <V4MigrationExperimentsSection
              key="11"
              state={{ status: "loaded", result: "sdk_usage_inconclusive" }}
              upgradePath="sdk"
              defaultOpen
            />,
          ],
          [
            "12. Deprecated APIs called",
            <V4MigrationApisSection
              key="12"
              state={{ status: "loaded", count: apiUsage.length }}
              usage={apiUsage}
              defaultOpen
            />,
          ],
          [
            "13. Deprecated integrations exporting",
            <V4MigrationIntegrationsSection
              key="13"
              state={{ status: "loaded", count: integrations.length }}
              integrations={integrations}
              integrationsUrl="/project/demo/settings/integrations"
              defaultOpen
            />,
          ],
          [
            "14. Checker still loading (evals shown; same chip on all checkers)",
            <V4MigrationEvalsSection
              key="14"
              state={{ status: "loading", count: 0 }}
              assistant={null}
              defaultOpen
            />,
          ],
          [
            "15. Checker failed (evals shown; same chip on all checkers)",
            <V4MigrationEvalsSection
              key="15"
              state={{ status: "error", count: 0 }}
              assistant={null}
              defaultOpen
            />,
          ],
          [
            "16. Clean sections collapse into one summary line",
            <p key="16" className="text-muted-foreground py-1.5 text-sm">
              Evals, experiments, APIs and integrations are up to date.
            </p>,
          ],
          [
            "17. Everything at once",
            <div key="17">
              <V4MigrationSdkSection sdk={combinedState} defaultOpen />
              <V4MigrationOtelSection sdk={combinedState} defaultOpen />
              <V4MigrationCustomInstrumentationSection
                sdk={combinedState}
                defaultOpen
              />
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
