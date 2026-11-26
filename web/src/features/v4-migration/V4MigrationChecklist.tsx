/* eslint-disable no-nested-ternary, react/no-unstable-nested-components */
/* eslint-disable @repo/no-null-render */
import { type ReactNode } from "react";
import Link from "next/link";
import {
  BotMessageSquare,
  ChevronRight,
  CircleCheck,
  TriangleAlert,
} from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import {
  formatSdkUpgradeRequirement,
  formatSdkVersion,
  getAvailableSdkMajorUpgrade,
  getCustomInstrumentationSectionState,
  getDetectedInstrumentationSeries,
  getMigratedSeriesByKey,
  getOtelSectionState,
  getSdkSectionState,
  isActionableSdkSeries,
  type V4MigrationSdkState,
  type MigratedKeySeries,
  type V4MigrationSdkUsageSeries,
} from "@/src/features/v4-migration/sdkVersionStatus";
import { V4MigrationStatusDot } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import type { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import {
  V4_MIGRATION_LOOKBACK_DAYS,
  type MigrationActionState,
  type MigrationCountState,
} from "@/src/features/v4-migration/migrationData";
import { numberFormatter } from "@/src/utils/numbers";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import {
  getApiMigrationGuidance,
  getCodingAgentName,
  type MigrationSdkName,
} from "@/src/features/v4-migration/apiMigrationGuidance";
import { V4MigrationExternalLink } from "./V4MigrationExternalLink";
import { V4_DOCS_URL } from "./constants";

const SDK_UPGRADE_URL =
  "https://langfuse.com/docs/observability/sdk/upgrade-path";
const OTEL_V4_MIGRATION_URL =
  "https://langfuse.com/integrations/native/opentelemetry/migration-to-v4";
const DEPRECATED_API_MIGRATION_URL =
  "https://langfuse.com/faq/all/deprecated-api-migration";
const DEPRECATED_INTEGRATION_MIGRATION_URLS: Record<string, string> = {
  PostHog:
    "https://langfuse.com/integrations/analytics/posthog#migrate-export-source",
  Mixpanel:
    "https://langfuse.com/integrations/analytics/mixpanel#migrate-export-source",
  "Blob Storage":
    "https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage#upgrade-path",
};
const EXPERIMENT_OTEL_INGESTION_URL =
  "https://langfuse.com/integrations/native/opentelemetry/experiments";
// The docs ship one combined SDK page, which is also the right target for
// language-agnostic guidance: the upgrade applies to every Langfuse SDK, not
// just the two most common ones.
const SDK_OVERVIEW_URL = "https://langfuse.com/docs/observability/sdk/overview";
const OTEL_INTEGRATION_URL =
  "https://langfuse.com/integrations/native/opentelemetry";
function Section({
  title,
  count,
  meta,
  children,
  defaultOpen,
  analyticsSection,
  statusVariant = "action",
  tone = "default",
}: {
  title: string;
  /** Number of affected items, shown muted after the title. */
  count?: number;
  /** Right-aligned muted text for transient states (checking, failed). */
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Funnel dimension for the section_expanded event (snake_case). */
  analyticsSection: string;
  statusVariant?: "action" | "done";
  /** "muted" recesses the trigger to match the settled-checks summary line, so
   *  a section that needs no action does not read as an action item. */
  tone?: "default" | "muted";
}) {
  const capture = usePostHogClientCapture();
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      onOpenChange={(isOpen) => {
        // User expansions only — defaultOpen does not fire onOpenChange.
        if (isOpen)
          capture("v4_migration:section_expanded", {
            section: analyticsSection,
          });
      }}
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2.5 py-2.5 text-left">
        <V4MigrationStatusDot variant={statusVariant} />
        <span
          className={cn(
            "flex items-center gap-1.5 text-sm",
            tone === "muted"
              ? "text-muted-foreground"
              : "text-foreground font-bold",
          )}
        >
          {title}
          {typeof count === "number" && (
            // Same count-badge recipe as the "My Views" table button.
            <span className="bg-input rounded-sm px-1 text-xs">{count}</span>
          )}
        </span>
        <span className="flex-1" />
        {meta && <span className="text-muted-foreground text-xs">{meta}</span>}
        <ChevronRight
          size="base"
          color="tertiary"
          __rawClassName="transition-transform group-data-[state=open]:rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-0.5 pb-4 pl-4.25">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MonoValue({ children }: { children: ReactNode }) {
  return <span className="text-foreground font-bold">{children}</span>;
}

// Evidence deep-link filter for one SDK usage series: always the exact public
// key (including the empty value used by raw OTel ingestion), source, plus the
// ingestion SDK name/version when the series carries exact values — so two SDK
// versions on the same key link to distinct result sets.
// "unknown" is the attribution fallback bucket, not an exact value, so those
// dimensions fall back to key + source.
function buildSdkUsageEvidenceFilter(usage: V4MigrationSdkUsageSeries): string {
  const filters: FilterState = [
    {
      column: "ingestionApiKey",
      type: "stringOptions",
      operator: "any of",
      value: [usage.publicKey],
    },
    {
      column: "ingestionSource",
      type: "stringOptions",
      operator: "any of",
      value: [usage.source],
    },
  ];
  if (usage.sdkName !== "unknown") {
    filters.push({
      column: "ingestionSdkName",
      type: "stringOptions",
      operator: "any of",
      value: [usage.sdkName],
    });
  }
  if (usage.sdkVersion !== "unknown") {
    filters.push({
      column: "ingestionSdkVersion",
      type: "stringOptions",
      operator: "any of",
      value: [usage.sdkVersion],
    });
  }
  return encodeFiltersGeneric(filters);
}

// Bordered code block with a corner copy button that swaps to a check for 2s
// as inline feedback. The agent prompt and the generated .env block both
// render through this so the copy affordance stays consistent.
function truncatePublicKey(publicKey: string): string {
  if (publicKey.length > 18) {
    return `${publicKey.slice(0, 9)}…${publicKey.slice(-6)}`;
  }
  return publicKey;
}

function ingestionModeLabel(deliveryMode: "realtime" | "delayed"): string {
  return deliveryMode === "realtime" ? "real-time" : "delayed";
}

function SdkUsageSeriesRows({
  series,
  needsAction,
  suffix,
  migratedByKey,
  unknownSeriesLabel = "Custom instrumentation",
  hideMissingApiKey = false,
  projectId,
  analyticsSection,
}: {
  series: V4MigrationSdkUsageSeries[];
  /** Drives the per-row status icon; the suffix carries the text meaning. */
  needsAction: (series: V4MigrationSdkUsageSeries) => boolean;
  suffix: (series: V4MigrationSdkUsageSeries) => ReactNode;
  /** Required rows whose key later sent on the new ingestion API. */
  migratedByKey?: Map<string, MigratedKeySeries>;
  /** Row label when the series carries no usable SDK name. */
  unknownSeriesLabel?: string;
  /** Omits the empty-key fallback when it is not useful to the user. */
  hideMissingApiKey?: boolean;
  /** Enables the evidence deep link. */
  projectId?: string;
  /** Funnel dimension for the evidence_link_clicked event (snake_case). */
  analyticsSection: string;
}) {
  const capture = usePostHogClientCapture();
  if (series.length === 0) return null;

  return (
    <ul className="mt-2 divide-y">
      {series.map((usage) => {
        const sdkLabel =
          usage.canonicalSdkName === null && usage.sdkName === "unknown"
            ? unknownSeriesLabel
            : formatSdkVersion({
                language: usage.canonicalSdkName ?? usage.sdkName,
                version: usage.sdkVersion,
              });
        const publicKey = (() => {
          if (usage.publicKey) {
            return truncatePublicKey(usage.publicKey);
          }
          if (hideMissingApiKey) {
            return null;
          }
          return "No API key";
        })();
        const evidenceHref =
          projectId && usage.eventCount > 0
            ? `/project/${projectId}/observations?filter=${encodeURIComponent(
                buildSdkUsageEvidenceFilter(usage),
              )}&dateRange=${V4_MIGRATION_LOOKBACK_DAYS}d`
            : null;

        const seriesKey = `${usage.source}:${usage.sdkName}:${usage.sdkVersion}:${usage.publicKey}`;
        const migrated = migratedByKey?.get(seriesKey);
        if (migrated) {
          return (
            <li key={seriesKey} className="py-2 text-sm">
              <div className="text-muted-foreground flex items-start gap-1.5">
                <CircleCheck
                  size="sm"
                  color="inherit"
                  __rawClassName="mt-0.5 text-green-600"
                  aria-hidden="true"
                />
                <span>
                  <span title={usage.publicKey}>
                    {truncatePublicKey(usage.publicKey)}
                  </span>{" "}
                  now uses the new ingestion API (
                  {ingestionModeLabel(migrated.successor.deliveryMode)}) · last
                  legacy event{" "}
                  {formatCompactRelativeTime(new Date(usage.lastSeen))}
                </span>
              </div>
            </li>
          );
        }

        return (
          <li key={seriesKey} className="py-2 text-sm">
            {/* Action line: what it is and what to do about it. */}
            <div className="text-muted-foreground flex items-center gap-1.5">
              {needsAction(usage) ? (
                <TriangleAlert
                  size="sm"
                  color="inherit"
                  __rawClassName="text-amber-500"
                  aria-hidden="true"
                />
              ) : (
                <CircleCheck
                  size="sm"
                  color="inherit"
                  __rawClassName="text-green-600"
                  aria-hidden="true"
                />
              )}
              <MonoValue>{sdkLabel}</MonoValue>
              {suffix(usage)}
            </div>
            {/* Metadata line, indented under the label (icon + gap). */}
            <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-1.5 pl-5">
              {publicKey ? (
                <span title={usage.publicKey || undefined}>{publicKey}</span>
              ) : null}
              <span>
                {publicKey ? "· " : ""}last seen{" "}
                {formatCompactRelativeTime(new Date(usage.lastSeen))}
              </span>
              {/* Deep link to the exact evidence: the events table filtered by
                  this public key, plus SDK name and version when attributed,
                  over the detection lookback. An empty public key is an exact
                  filter value for raw OTel ingestion. */}
              {evidenceHref ? (
                <>
                  <span aria-hidden="true">·</span>
                  <Link
                    // The events page's `filter` param carries the semicolon
                    // filter encoding (column;type;key;operator;value), not the
                    // search-bar grammar; the bar re-derives its text from it.
                    href={evidenceHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      // Bounded values only: raw sdkName/sdkVersion are
                      // client-supplied ingestion headers (user-controlled,
                      // unbounded cardinality) and must not reach PostHog.
                      capture("v4_migration:evidence_link_clicked", {
                        section: analyticsSection,
                        sdkName: usage.canonicalSdkName ?? "other",
                        v4MigrationStatus: usage.v4MigrationStatus,
                        attributionStatus: usage.attributionStatus,
                      });
                    }}
                    className="underline"
                  >
                    View observations
                  </Link>
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Renders only while there is at least one recognized SDK with a pending
// upgrade (unrecognized SDKs live in the custom instrumentation section).
// Also carries the transient
// checking/error states so they are not silently lost.
// Exported for the state-gallery story.
function V4MigrationSdkSection({
  sdk,
  defaultOpen,
  projectId,
}: {
  sdk: V4MigrationSdkState;
  defaultOpen?: boolean;
  projectId?: string;
}) {
  const section = getSdkSectionState(sdk);
  if (
    section.series.length === 0 &&
    section.status !== "checking" &&
    section.status !== "error"
  ) {
    return null;
  }
  if (section.status === "no_data") return null;

  const isTransient =
    section.status === "checking" || section.status === "error";
  const allMigrated = !isTransient && section.actionableCount === 0;

  return (
    <Section
      title="Update SDK"
      analyticsSection="sdk"
      statusVariant={allMigrated ? "done" : "action"}
      count={
        isTransient || section.actionableCount === 0
          ? undefined
          : section.actionableCount
      }
      meta={
        section.status === "checking"
          ? "Checking…"
          : section.status === "error"
            ? "Check failed"
            : undefined
      }
      defaultOpen={defaultOpen}
    >
      {allMigrated ? null : (
        <p className="text-muted-foreground text-sm leading-relaxed">
          {section.status === "checking" ? (
            "Checking the latest traces for this project…"
          ) : section.status === "error" ? (
            "We could not check the latest traces for this project. Try again later."
          ) : (
            <>
              {section.actionableCount} detected SDK{" "}
              {section.actionableCount === 1
                ? "configuration needs"
                : "configurations need"}{" "}
              an update, based on ingestion seen in the last{" "}
              {V4_MIGRATION_LOOKBACK_DAYS} days. See{" "}
              <V4MigrationExternalLink
                href={SDK_UPGRADE_URL}
                analytics={{ section: "sdk", link: "sdk_upgrade_docs" }}
              >
                upgrade path
              </V4MigrationExternalLink>
              .
            </>
          )}
        </p>
      )}
      <SdkUsageSeriesRows
        series={section.series}
        projectId={projectId}
        analyticsSection="sdk"
        migratedByKey={getMigratedSeriesByKey(sdk)}
        needsAction={isActionableSdkSeries}
        suffix={(usage) => {
          if (usage.v4MigrationStatus === "upgrade_required") {
            return <span>· {formatSdkUpgradeRequirement(usage)}</span>;
          }
          if (usage.v4MigrationStatus === "unknown") {
            return <span>· version not recognized</span>;
          }
          return null;
        }}
      />
    </Section>
  );
}

// Renders only while at least one OTel exporter still ingests through the
// delayed path; the SDK section above owns the checking/error states.
// Exported for the state-gallery story.
function V4MigrationOtelSection({
  sdk,
  defaultOpen,
  projectId,
}: {
  sdk: V4MigrationSdkState;
  defaultOpen?: boolean;
  projectId?: string;
}) {
  const section = getOtelSectionState(sdk);
  if (
    sdk.status === "checking" ||
    sdk.status === "error" ||
    section.series.length === 0
  )
    return null;

  const allMigrated = section.pendingCount === 0;

  return (
    <Section
      title="Update OTel Instrumentation"
      analyticsSection="otel"
      statusVariant={allMigrated ? "done" : "action"}
      count={allMigrated ? undefined : section.pendingCount}
      defaultOpen={defaultOpen}
    >
      {allMigrated ? null : (
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your OpenTelemetry data is using delayed ingestion. For real-time
          ingestion, upgrade your integration or, if you use OpenTelemetry
          directly, set <MonoValue>x-langfuse-ingestion-version: 4</MonoValue>{" "}
          on your OTLP exporter.{" "}
          <V4MigrationExternalLink
            href={OTEL_V4_MIGRATION_URL}
            analytics={{ section: "otel", link: "otel_migration_docs" }}
          >
            Migration guide
          </V4MigrationExternalLink>
          .
        </p>
      )}
      <SdkUsageSeriesRows
        series={section.series}
        projectId={projectId}
        analyticsSection="otel"
        migratedByKey={getMigratedSeriesByKey(sdk)}
        needsAction={(usage) => usage.actionLevel === "required"}
        suffix={(usage) =>
          usage.deliveryMode === "delayed" ? (
            <span>· delayed</span>
          ) : (
            <span>· real-time</span>
          )
        }
      />
    </Section>
  );
}

// Renders only while ingestion-API traffic without a Langfuse SDK header is
// detected: custom instrumentation against POST /api/public/ingestion, or an
// SDK too old to send attribution headers. Exported for the gallery story.
function V4MigrationCustomInstrumentationSection({
  sdk,
  defaultOpen,
  projectId,
}: {
  sdk: V4MigrationSdkState;
  defaultOpen?: boolean;
  projectId?: string;
}) {
  const section = getCustomInstrumentationSectionState(sdk);
  if (
    sdk.status === "checking" ||
    sdk.status === "error" ||
    section.series.length === 0
  )
    return null;

  const allMigrated = section.actionableCount === 0;

  return (
    <Section
      title="Upgrade Instrumentation"
      analyticsSection="custom_instrumentation"
      statusVariant={allMigrated ? "done" : "action"}
      count={allMigrated ? undefined : section.actionableCount}
      defaultOpen={defaultOpen}
    >
      {allMigrated ? null : (
        <p className="text-muted-foreground text-sm leading-relaxed">
          Data is arriving through the ingestion API without a Langfuse SDK
          header, so this looks like custom instrumentation or a very old SDK
          version. Please upgrade to the latest version of{" "}
          <V4MigrationExternalLink
            href={SDK_OVERVIEW_URL}
            analytics={{
              section: "custom_instrumentation",
              link: "sdk_overview_docs",
            }}
          >
            any Langfuse SDK
          </V4MigrationExternalLink>
          , or use the{" "}
          <V4MigrationExternalLink
            href={OTEL_INTEGRATION_URL}
            analytics={{
              section: "custom_instrumentation",
              link: "otel_integration_docs",
            }}
          >
            OpenTelemetry endpoint
          </V4MigrationExternalLink>
          .
        </p>
      )}
      <SdkUsageSeriesRows
        series={section.series}
        projectId={projectId}
        unknownSeriesLabel="Custom instrumentation"
        hideMissingApiKey
        analyticsSection="custom_instrumentation"
        migratedByKey={getMigratedSeriesByKey(sdk)}
        needsAction={() => true}
        suffix={() => null}
      />
    </Section>
  );
}

function V4MigrationDetectedInstrumentationSection({
  sdk,
  projectId,
}: {
  sdk: V4MigrationSdkState;
  projectId?: string;
}) {
  const series = getDetectedInstrumentationSeries(sdk);
  if (series.length === 0) return null;

  return (
    <Section
      title="Detected V4-compatible instrumentation"
      analyticsSection="detected_instrumentation"
      count={series.length}
      statusVariant="done"
      tone="muted"
    >
      <p className="text-muted-foreground text-sm leading-relaxed">
        These configurations are on a V4-compatible SDK major or use real-time
        OTel ingestion.
      </p>
      <SdkUsageSeriesRows
        series={series}
        projectId={projectId}
        analyticsSection="detected_instrumentation"
        needsAction={() => false}
        suffix={(usage) => {
          if (usage.remediationType !== "update_sdk") {
            return <span>· real-time</span>;
          }
          const majorUpgrade = getAvailableSdkMajorUpgrade(usage);
          if (!majorUpgrade) return <span>· up to date</span>;
          return (
            <span>
              · {majorUpgrade.label} is available ·{" "}
              <V4MigrationExternalLink
                href={majorUpgrade.upgradeGuideUrl}
                analytics={{
                  section: "detected_instrumentation",
                  link: "sdk_major_upgrade_docs",
                }}
              >
                Upgrade guide
              </V4MigrationExternalLink>
            </span>
          );
        }}
      />
    </Section>
  );
}

// The four checker sections below are presentational (data via props) so the
// state gallery story can render every variant without tRPC or router mocks.

function V4MigrationEvalsSection({
  state,
  assistant,
  evalsUrl,
  onNavigate,
  defaultOpen,
}: {
  state: MigrationCountState;
  /** Upgrade CTA; null hides the button. Assistant branding only while AI
   *  features are on — otherwise the dialog opens on its choice screen, so
   *  the button must not promise the assistant. */
  assistant: { onMigrate: () => void; aiFeaturesEnabled?: boolean } | null;
  evalsUrl?: string;
  onNavigate?: () => void;
  defaultOpen?: boolean;
}) {
  const capture = usePostHogClientCapture();
  return (
    <Section
      title="Update Evals"
      analyticsSection="evals"
      count={state.status === "loaded" ? state.count : undefined}
      meta={
        state.status === "loading"
          ? "Checking…"
          : state.status === "error"
            ? "Check failed"
            : undefined
      }
      defaultOpen={defaultOpen}
    >
      {state.status === "loading" ? (
        <p className="text-muted-foreground text-sm">
          Checking configured evals…
        </p>
      ) : state.status === "error" ? (
        <p className="text-muted-foreground text-sm">
          We could not check configured evals. Try again later.
        </p>
      ) : state.count > 0 ? (
        <>
          <p className="text-muted-foreground mb-2 text-sm">
            {evalsUrl ? (
              <Link
                href={evalsUrl}
                onClick={() => {
                  capture("v4_migration:section_link_clicked", {
                    section: "evals",
                    link: "evals_table",
                  });
                  onNavigate?.();
                }}
                className="underline"
              >
                {state.count}{" "}
                {state.count === 1 ? "eval targets" : "evals target"} trace
                input/output
              </Link>
            ) : (
              <>
                {state.count}{" "}
                {state.count === 1 ? "eval targets" : "evals target"} trace
                input/output
              </>
            )}
            , which v4 no longer sets. Update{" "}
            {state.count === 1 ? "it" : "them"} to target observations.
          </p>
          {assistant && (
            <Button variant="outline" size="sm" onClick={assistant.onMigrate}>
              {assistant.aiFeaturesEnabled !== false ? (
                <>
                  <BotMessageSquare
                    size="base"
                    color="default"
                    __rawClassName="mr-1.5"
                  />
                  Use Halo
                </>
              ) : (
                "Update evals"
              )}
            </Button>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          No deprecated evals detected.
        </p>
      )}
    </Section>
  );
}

function V4MigrationExperimentsSection({
  state,
  upgradePath,
  defaultOpen,
}: {
  state: MigrationActionState;
  upgradePath: "sdk" | "api" | null;
  defaultOpen?: boolean;
}) {
  return (
    <Section
      title="Update Experiments"
      analyticsSection="experiments"
      meta={
        state.status === "loading"
          ? "Checking…"
          : state.status === "error"
            ? "Check failed"
            : undefined
      }
      defaultOpen={defaultOpen}
    >
      {state.status === "loading" ? (
        <p className="text-muted-foreground text-sm">
          Checking experiment instrumentation…
        </p>
      ) : state.status === "error" ? (
        <p className="text-muted-foreground text-sm">
          We could not check experiment instrumentation. Try again later.
        </p>
      ) : state.result !== "not_required" ? (
        <p className="text-muted-foreground text-sm">
          {upgradePath === "api" ? (
            <>
              This project called the deprecated{" "}
              <MonoValue>POST /dataset-run-items</MonoValue>. Replace this
              direct API call with OTel experiment instrumentation. See the{" "}
              <V4MigrationExternalLink
                href={EXPERIMENT_OTEL_INGESTION_URL}
                analytics={{
                  section: "experiments",
                  link: "experiments_otel_docs",
                }}
              >
                OTel experiment instrumentation guide
              </V4MigrationExternalLink>{" "}
              for more details.
            </>
          ) : state.result === "sdk_usage_inconclusive" ? (
            <>
              This project called <MonoValue>POST /dataset-run-items</MonoValue>{" "}
              with an SDK version that supports the experiment runner. Review
              that you are using the experiment runner SDK and not the
              deprecated{" "}
              <>
                <>
                  <code className="bg-muted px-1 font-mono text-sm">
                    .link()
                  </code>{" "}
                  method. This warning will{" "}
                </>
                disappear once you{" "}
              </>
              upgrade to latest SDK version.
            </>
          ) : (
            <>
              This project called <MonoValue>POST /dataset-run-items</MonoValue>{" "}
              with an outdated SDK.{" "}
              <V4MigrationExternalLink
                href={SDK_UPGRADE_URL}
                analytics={{ section: "experiments", link: "sdk_upgrade_docs" }}
              >
                Upgrade the SDK
              </V4MigrationExternalLink>{" "}
              and use the experiment runner method.
            </>
          )}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          No experiment instrumentation updates required.
        </p>
      )}
    </Section>
  );
}

function V4MigrationApisSection({
  state,
  usage,
  defaultOpen,
}: {
  state: MigrationCountState;
  usage: {
    endpoint: string;
    count: number;
    lastSeen: string;
    callers?: {
      sdkName?: MigrationSdkName;
      sdkVersion?: string;
      userAgent?: string;
      isOther?: true;
      count: number;
      lastSeen: string;
    }[];
  }[];
  defaultOpen?: boolean;
}) {
  return (
    <Section
      title="Migrate APIs"
      analyticsSection="apis"
      count={state.status === "loaded" ? state.count : undefined}
      meta={
        state.status === "loading"
          ? "Checking…"
          : state.status === "error"
            ? "Check failed"
            : undefined
      }
      defaultOpen={defaultOpen}
    >
      {state.status === "loading" ? (
        <p className="text-muted-foreground text-sm">
          Checking public API usage…
        </p>
      ) : state.status === "error" ? (
        <p className="text-muted-foreground text-sm">
          We could not check public API usage. Try again later.
        </p>
      ) : usage.length > 0 ? (
        <>
          <p className="text-muted-foreground mb-2 text-sm">
            You&apos;ve recently called deprecated endpoints that will stop
            working after the migration deadline. Please check the{" "}
            <V4MigrationExternalLink
              href={DEPRECATED_API_MIGRATION_URL}
              analytics={{ section: "apis", link: "deprecated_api_docs" }}
            >
              migration guide
            </V4MigrationExternalLink>
          </p>
          <div className="divide-y">
            {usage.map((row) => {
              const roundedCount = Math.max(1, Math.round(row.count));
              const callers = row.callers ?? [];
              const hasKnownCallers = callers.some((caller) => !caller.isOther);
              const publicApiPrefix = "/api/public/";
              const publicApiPrefixStart =
                row.endpoint.indexOf(publicApiPrefix);
              const publicApiPrefixEnd =
                publicApiPrefixStart < 0
                  ? 0
                  : publicApiPrefixStart + publicApiPrefix.length;

              return (
                <div key={row.endpoint} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <V4MigrationExternalLink
                      href={DEPRECATED_API_MIGRATION_URL}
                      size="sm"
                      analytics={{
                        section: "apis",
                        link: "deprecated_api_docs",
                      }}
                      ariaLabel={row.endpoint}
                    >
                      {row.endpoint.slice(0, publicApiPrefixEnd)}
                      <span className="font-bold">
                        {row.endpoint.slice(publicApiPrefixEnd)}
                      </span>
                    </V4MigrationExternalLink>
                    {!hasKnownCallers ? (
                      <span
                        className="text-muted-foreground text-sm whitespace-nowrap"
                        title={`Last seen at ${row.lastSeen}`}
                      >
                        {numberFormatter(roundedCount, 0)}{" "}
                        {roundedCount === 1 ? "call" : "calls"} · last seen{" "}
                        {formatCompactRelativeTime(new Date(row.lastSeen))}
                      </span>
                    ) : null}
                  </div>
                  {hasKnownCallers ? (
                    <ul className="mt-1 divide-y">
                      {callers.map((caller, index) => {
                        const codingAgent = getCodingAgentName(
                          caller.userAgent,
                        );
                        const guidance = getApiMigrationGuidance(
                          row.endpoint,
                          caller.sdkName,
                          caller.sdkVersion,
                        );
                        const callerName = (() => {
                          if (caller.isOther) {
                            return "Unknown callers";
                          }
                          if (caller.sdkName) {
                            return `Langfuse ${caller.sdkName === "python" ? "Python" : "JavaScript"} SDK${caller.sdkVersion ? ` ${caller.sdkVersion}` : ""}`;
                          }
                          if (codingAgent) {
                            return codingAgent;
                          }
                          return caller.userAgent || "Unknown caller";
                        })();
                        const callerCount = Math.max(
                          1,
                          Math.round(caller.count),
                        );

                        return (
                          <li
                            key={`${callerName}-${index}`}
                            className="py-2 text-sm"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                              <div className="text-muted-foreground flex items-center gap-1.5">
                                <TriangleAlert
                                  size="sm"
                                  color="inherit"
                                  __rawClassName="text-amber-500"
                                  aria-hidden="true"
                                />
                                <MonoValue>{callerName}</MonoValue>
                              </div>
                              <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-1.5 pl-5 sm:pl-0">
                                <span>
                                  {numberFormatter(callerCount, 0)}{" "}
                                  {callerCount === 1 ? "call" : "calls"} · last
                                  seen{" "}
                                  {formatCompactRelativeTime(
                                    new Date(caller.lastSeen),
                                  )}
                                </span>
                              </div>
                            </div>
                            {codingAgent && !caller.sdkName ? (
                              <p className="text-muted-foreground mt-1 pl-5 text-xs">
                                This looks like traffic from a coding agent. If
                                the call was only exploratory and is not part of
                                a running service, you may not need to migrate
                                application code.{" "}
                                <V4MigrationExternalLink
                                  href={DEPRECATED_API_MIGRATION_URL}
                                  analytics={{
                                    section: "apis",
                                    link: "deprecated_api_caller_docs",
                                  }}
                                >
                                  See docs.
                                </V4MigrationExternalLink>
                              </p>
                            ) : guidance.currentMethod &&
                              guidance.replacementMethod ? (
                              <p className="text-muted-foreground mt-1 pl-5 text-xs">
                                {guidance.currentMethod ===
                                guidance.replacementMethod ? (
                                  <>
                                    Upgrade to SDK v{guidance.latestMajor},
                                    where{" "}
                                    <MonoValue>
                                      {guidance.replacementMethod}
                                    </MonoValue>{" "}
                                    calls the new API
                                  </>
                                ) : (
                                  <>
                                    Replace{" "}
                                    <MonoValue>
                                      {guidance.currentMethod}
                                    </MonoValue>{" "}
                                    with{" "}
                                    <MonoValue>
                                      {guidance.replacementMethod}
                                    </MonoValue>
                                    {guidance.previousMajorReplacementMethod
                                      ? ` (SDK v${guidance.latestMajor})`
                                      : null}
                                  </>
                                )}
                                {guidance.previousMajorReplacementMethod &&
                                guidance.minimumVersion &&
                                guidance.latestMajor ? (
                                  <>
                                    . On{" "}
                                    <MonoValue>
                                      {guidance.minimumVersion}–
                                      {guidance.latestMajor - 1}.x
                                    </MonoValue>
                                    , use{" "}
                                    <MonoValue>
                                      {guidance.previousMajorReplacementMethod}
                                    </MonoValue>
                                  </>
                                ) : guidance.requiresUpgrade &&
                                  guidance.minimumVersion ? (
                                  <>
                                    . First upgrade to SDK v
                                    {guidance.latestMajor} (
                                    <MonoValue>
                                      {guidance.minimumVersion} or newer
                                    </MonoValue>{" "}
                                    also works)
                                  </>
                                ) : null}
                                .{" "}
                                <V4MigrationExternalLink
                                  href={DEPRECATED_API_MIGRATION_URL}
                                  analytics={{
                                    section: "apis",
                                    link: "deprecated_api_caller_docs",
                                  }}
                                >
                                  See docs.
                                </V4MigrationExternalLink>
                              </p>
                            ) : (
                              <p className="text-muted-foreground mt-1 pl-5 text-xs">
                                Migrate calls to{" "}
                                <MonoValue>{guidance.replacement}</MonoValue>.{" "}
                                <V4MigrationExternalLink
                                  href={DEPRECATED_API_MIGRATION_URL}
                                  analytics={{
                                    section: "apis",
                                    link: "deprecated_api_caller_docs",
                                  }}
                                >
                                  See docs.
                                </V4MigrationExternalLink>
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          No deprecated public API usage detected in the last{" "}
          {V4_MIGRATION_LOOKBACK_DAYS} days. This check refreshes about every 15
          minutes.
        </p>
      )}
    </Section>
  );
}

function V4MigrationIntegrationsSection({
  state,
  integrations,
  integrationsUrl,
  onNavigate,
  defaultOpen,
}: {
  state: MigrationCountState;
  integrations: string[];
  integrationsUrl?: string;
  onNavigate?: () => void;
  defaultOpen?: boolean;
}) {
  const capture = usePostHogClientCapture();
  return (
    <Section
      title="Migrate Integrations"
      analyticsSection="integrations"
      count={state.status === "loaded" ? state.count : undefined}
      meta={
        state.status === "loading"
          ? "Checking…"
          : state.status === "error"
            ? "Check failed"
            : undefined
      }
      defaultOpen={defaultOpen}
    >
      {state.status === "loading" ? (
        <p className="text-muted-foreground text-sm">Checking integrations…</p>
      ) : state.status === "error" ? (
        <p className="text-muted-foreground text-sm">
          We could not check integrations. Try again later.
        </p>
      ) : integrations.length > 0 ? (
        <>
          <p className="text-muted-foreground mb-2 text-sm">
            These exports still read from the old data source. Switching them
            over can change what downstream consumers receive, so worth a quick
            check.
          </p>
          <div className="flex flex-col">
            {integrations.map((name) => (
              <div
                key={name}
                className="text-muted-foreground flex items-baseline gap-1.5 py-0.5"
              >
                {integrationsUrl ? (
                  <Link
                    href={integrationsUrl}
                    onClick={() => {
                      capture("v4_migration:section_link_clicked", {
                        section: "integrations",
                        link: "integrations_settings",
                      });
                      onNavigate?.();
                    }}
                    className="text-sm underline"
                  >
                    {name}
                  </Link>
                ) : (
                  <span className="text-sm">{name}</span>
                )}
                <span className="text-muted-foreground text-sm">·</span>
                <V4MigrationExternalLink
                  href={
                    DEPRECATED_INTEGRATION_MIGRATION_URLS[name] ?? V4_DOCS_URL
                  }
                  size="sm"
                  analytics={{
                    section: "integrations",
                    link: "integration_migration_docs",
                  }}
                >
                  Migration guide
                </V4MigrationExternalLink>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          No deprecated integration exports detected.
        </p>
      )}
    </Section>
  );
}

export function V4MigrationChecklist({
  migrationData,
  evidenceProjectId,
  assistant,
  evalsUrl,
  integrationsUrl,
  onNavigate,
  defaultOpen,
}: {
  migrationData: Omit<
    ReturnType<typeof useProjectV4MigrationData>,
    "forceV3Experience"
  >;
  evidenceProjectId?: string;
  assistant: Parameters<typeof V4MigrationEvalsSection>[0]["assistant"];
  evalsUrl?: string;
  integrationsUrl?: string;
  onNavigate?: () => void;
  defaultOpen?: boolean;
}) {
  const evalsClean =
    migrationData.evals.status === "loaded" && migrationData.evals.count === 0;
  const experimentsClean =
    migrationData.experiments.status === "loaded" &&
    migrationData.experiments.result === "not_required";
  const apisClean =
    migrationData.apis.status === "loaded" && migrationData.apis.count === 0;
  const exportsClean =
    migrationData.exports.status === "loaded" &&
    migrationData.exports.count === 0;
  const cleanLabels = [
    evalsClean ? "evals" : null,
    experimentsClean ? "experiments" : null,
    apisClean ? "APIs" : null,
    exportsClean ? "integrations" : null,
  ].filter((label): label is string => label !== null);
  const cleanSummary =
    cleanLabels.length > 1
      ? `${cleanLabels.slice(0, -1).join(", ")} and ${cleanLabels.at(-1)}`
      : cleanLabels[0];

  return (
    <>
      <V4MigrationSdkSection
        sdk={migrationData.sdk}
        projectId={evidenceProjectId}
        defaultOpen={defaultOpen}
      />
      <V4MigrationOtelSection
        sdk={migrationData.sdk}
        projectId={evidenceProjectId}
        defaultOpen={defaultOpen}
      />
      <V4MigrationCustomInstrumentationSection
        sdk={migrationData.sdk}
        projectId={evidenceProjectId}
        defaultOpen={defaultOpen}
      />
      {!evalsClean && (
        <V4MigrationEvalsSection
          state={migrationData.evals}
          assistant={assistant}
          evalsUrl={evalsUrl}
          onNavigate={onNavigate}
          defaultOpen={defaultOpen}
        />
      )}
      {!experimentsClean && (
        <V4MigrationExperimentsSection
          state={migrationData.experiments}
          upgradePath={migrationData.experimentInstrumentationUpgradePath}
          defaultOpen={defaultOpen}
        />
      )}
      {!apisClean && (
        <V4MigrationApisSection
          state={migrationData.apis}
          usage={migrationData.apiUsage}
          defaultOpen={defaultOpen}
        />
      )}
      {!exportsClean && (
        <V4MigrationIntegrationsSection
          state={migrationData.exports}
          integrations={migrationData.legacyIntegrations}
          integrationsUrl={integrationsUrl}
          onNavigate={onNavigate}
          defaultOpen={defaultOpen}
        />
      )}
      {cleanSummary && (
        <p className="text-muted-foreground flex items-center gap-2.5 py-2.5 text-sm">
          <V4MigrationStatusDot variant="done" />
          {`${cleanSummary.charAt(0).toUpperCase()}${cleanSummary.slice(1)} are up to date.`}
        </p>
      )}
      <V4MigrationDetectedInstrumentationSection
        sdk={migrationData.sdk}
        projectId={evidenceProjectId}
      />
    </>
  );
}
