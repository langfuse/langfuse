/* eslint-disable @repo/no-style-props, @repo/no-null-render */
import { showSuccessToast, showErrorToast } from "@/src/features/notifications";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  BotMessageSquare,
  Check,
  ChevronRight,
  Copy,
  Info,
} from "lucide-react";
import { env } from "@/src/env.mjs";
import { useIsInAppAgentLauncherVisible } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { Button } from "@/src/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { RainbowButton } from "@/src/components/magicui/rainbow-button";
import { Separator } from "@/src/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { cn } from "@/src/utils/tailwind";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import {
  formatSdkUpgradeRequirement,
  formatSdkVersion,
  getCustomInstrumentationSectionState,
  getDetectedInstrumentationSeries,
  getOtelSectionState,
  getSdkSectionState,
  isActionableSdkSeries,
  type V4MigrationSdkState,
  type V4MigrationSdkUsageSeries,
} from "@/src/features/v4-migration/sdkVersionStatus";
import { V4MigrationStatusDot } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import {
  getProjectMigrationReadiness,
  V4_MIGRATION_LOOKBACK_DAYS,
  type MigrationActionState,
  type MigrationCountState,
  type ProjectMigrationReadiness,
} from "@/src/features/v4-migration/migrationData";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { numberFormatter } from "@/src/utils/numbers";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { V4PreviewToggleRow } from "@/src/features/events/components/V4SidebarToggle";
import {
  useEvalUpgradeAssistantPlan,
  V4_CODING_AGENT_PROMPT,
} from "@/src/features/v4-migration/useV4UpgradeAssistantSupport";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { EvaluatorMigrationDialog } from "@/src/features/v4-migration/EvaluatorMigrationDialog";
import { buildDeprecatedRulesUrl } from "@/src/features/v4-migration/evaluatorMigrationUrls";
import {
  getApiMigrationGuidance,
  getCodingAgentName,
  type MigrationSdkName,
} from "@/src/features/v4-migration/apiMigrationGuidance";

// Single source of truth for the v4-migration copy and content. Both surfaces
// (side panel and modal) render these components — edit copy here only.

const V4_DOCS_URL = "https://langfuse.com/docs/v4";
const V4_TIMELINE_URL = `${V4_DOCS_URL}#timeline`;
// Consumed by the status page deadline copy.
export const V4_MIGRATION_DEADLINE = "November 16, 2026";
// Headline form of the deadline; the year is noise in a title.
const V4_MIGRATION_DEADLINE_SHORT = "November 16";
const SDK_UPGRADE_URL =
  "https://langfuse.com/docs/observability/sdk/upgrade-path";
const OTEL_V4_MIGRATION_URL =
  "https://langfuse.com/integrations/native/opentelemetry/migration-to-v4";
const DEPRECATED_API_MIGRATION_URL =
  "https://langfuse.com/faq/all/deprecated-api-migration";
const OBSERVATIONS_DATA_MODEL_URL =
  "https://langfuse.com/docs/observability/data-model#observations-and-traces";
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
// v4 feature docs linked from the upgrade header pitch.
const FULL_TEXT_SEARCH_URL =
  "https://langfuse.com/docs/observability/features/full-text-search";
const FILTER_SEARCH_BAR_URL =
  "https://langfuse.com/docs/observability/features/filter-search-bar";
const ALERTS_URL = "https://langfuse.com/docs/metrics/features/alerts";
const CODE_EVALUATORS_URL =
  "https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators";
const LANGFUSE_ASSISTANT_URL = "https://langfuse.com/docs/langfuse-assistant";
// Hassieb's 2 minute walkthrough of the upgrade steps. Linked (not embedded)
// from the Need help footer, so the panel stays free of YouTube player
// chrome and the CSP frame-src stays untouched. Cloud only: the video covers
// the steps as they apply to Langfuse Cloud projects.
const WALKTHROUGH_VIDEO_URL = "https://www.youtube.com/watch?v=g3YbbqVGt4g";

// Copies the agent migration prompt to the clipboard with toast + analytics;
// shared by the panel/modal header CTA and the status page.
export function useCopyMigrationPrompt() {
  const capture = usePostHogClientCapture();

  return async () => {
    // Falls back to a hidden textarea on non-secure contexts (plain-HTTP
    // self-hosted) where navigator.clipboard is unavailable.
    await copyTextToClipboard(V4_CODING_AGENT_PROMPT);
    capture("v4_migration:coding_agent_prompt_copied");
    showSuccessToast({
      title: "Prompt copied",
      description: "Paste it into Cursor, Codex, or another coding agent.",
    });
  };
}

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
        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
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

function ExternalLink({
  href,
  children,
  className,
  analytics,
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  /** Which guidance link in which section — for section_link_clicked. */
  analytics?: { section: string; link: string };
  ariaLabel?: string;
}) {
  const capture = usePostHogClientCapture();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("underline", className)}
      aria-label={ariaLabel}
      onClick={
        analytics
          ? () => capture("v4_migration:section_link_clicked", analytics)
          : undefined
      }
    >
      {children}
    </a>
  );
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
function CodeBlockWithCopy({
  text,
  copyLabel,
  onCopy,
  scrollable,
  className,
}: {
  text: string;
  /** Accessible label for the corner button, e.g. "Copy keys". */
  copyLabel: string;
  /** Fired after a successful copy (analytics). */
  onCopy?: () => void;
  scrollable?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The timeout is an external system: clear it so a panel closed right
  // after copying cannot fire a state update on an unmounted component.
  useEffect(
    () => () => {
      if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
    },
    [],
  );

  return (
    <div className={cn("bg-muted/50 relative rounded-md border", className)}>
      {/* The button anchors to the outer wrapper so it stays in the corner
          while the content scrolls. */}
      <div className={cn("p-3", scrollable && "max-h-32 overflow-y-auto")}>
        <code className="text-muted-foreground font-mono text-[10px] leading-4 break-words whitespace-pre-wrap">
          {text}
        </code>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={async () => {
          // Falls back to a hidden textarea on non-secure contexts
          // (plain-HTTP self-hosted) where navigator.clipboard is
          // unavailable.
          await copyTextToClipboard(text);
          onCopy?.();
          setCopied(true);
          if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
          copiedTimeout.current = setTimeout(() => setCopied(false), 2000);
        }}
        aria-label={copied ? "Copied" : copyLabel}
        title={copied ? "Copied" : copyLabel}
        className="text-muted-foreground absolute top-1 right-1 h-6 w-6"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

function SdkUsageSeriesRows({
  series,
  needsAction,
  suffix,
  unknownSeriesLabel = "Custom instrumentation",
  hideMissingApiKey = false,
  projectId,
  analyticsSection,
}: {
  series: V4MigrationSdkUsageSeries[];
  /** Drives the per-row status emoji; the suffix carries the text meaning. */
  needsAction: (series: V4MigrationSdkUsageSeries) => boolean;
  suffix: (series: V4MigrationSdkUsageSeries) => ReactNode;
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
    <ul className="mt-2 flex flex-col gap-2">
      {series.map((usage) => {
        const sdkLabel =
          usage.canonicalSdkName === null && usage.sdkName === "unknown"
            ? unknownSeriesLabel
            : formatSdkVersion({
                language: usage.canonicalSdkName ?? usage.sdkName,
                version: usage.sdkVersion,
              });
        const publicKey = usage.publicKey
          ? usage.publicKey.length > 18
            ? `${usage.publicKey.slice(0, 9)}…${usage.publicKey.slice(-6)}`
            : usage.publicKey
          : hideMissingApiKey
            ? null
            : "No API key";
        const evidenceHref =
          projectId && usage.eventCount > 0
            ? `/project/${projectId}/observations?filter=${encodeURIComponent(
                buildSdkUsageEvidenceFilter(usage),
              )}&dateRange=${V4_MIGRATION_LOOKBACK_DAYS}d`
            : null;

        return (
          <li
            key={`${usage.source}:${usage.sdkName}:${usage.sdkVersion}:${usage.publicKey}`}
            // Message-box style: soft fill + a thicker left edge to group the
            // two lines of one item.
            className="bg-muted/50 border-border rounded-md border-l-4 p-2 text-sm"
          >
            {/* Action line: what it is and what to do about it. */}
            <div className="text-muted-foreground flex items-center gap-1.5">
              <span aria-hidden="true">{needsAction(usage) ? "⚠️" : "✅"}</span>
              <MonoValue>{sdkLabel}</MonoValue>
              {suffix(usage)}
            </div>
            {/* Metadata line, indented under the label (emoji + gap). */}
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
export function V4MigrationSdkSection({
  sdk,
  defaultOpen,
  projectId,
}: {
  sdk: V4MigrationSdkState;
  defaultOpen?: boolean;
  projectId?: string;
}) {
  const section = getSdkSectionState(sdk);
  if (section.status === "latest" || section.status === "no_data") return null;

  const isTransient =
    section.status === "checking" || section.status === "error";

  return (
    <Section
      title="Update SDK"
      analyticsSection="sdk"
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
            <ExternalLink
              href={SDK_UPGRADE_URL}
              analytics={{ section: "sdk", link: "sdk_upgrade_docs" }}
            >
              upgrade path
            </ExternalLink>
            .
          </>
        )}
      </p>
      <SdkUsageSeriesRows
        series={section.series}
        projectId={projectId}
        analyticsSection="sdk"
        needsAction={isActionableSdkSeries}
        suffix={(usage) =>
          usage.v4MigrationStatus === "upgrade_required" ? (
            <span>· {formatSdkUpgradeRequirement(usage.latestSdkMajor)}</span>
          ) : usage.v4MigrationStatus === "unknown" ? (
            <span>· version not recognized</span>
          ) : null
        }
      />
    </Section>
  );
}

// Renders only while at least one OTel exporter still ingests through the
// delayed path; the SDK section above owns the checking/error states.
// Exported for the state-gallery story.
export function V4MigrationOtelSection({
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
    section.delayedCount === 0
  )
    return null;

  return (
    <Section
      title="Update OTel Instrumentation"
      analyticsSection="otel"
      count={section.delayedCount}
      defaultOpen={defaultOpen}
    >
      <p className="text-muted-foreground text-sm leading-relaxed">
        Your OpenTelemetry data is using delayed ingestion. For real-time
        ingestion, upgrade your integration or, if you use OpenTelemetry
        directly, set <MonoValue>x-langfuse-ingestion-version: 4</MonoValue> on
        your OTLP exporter.{" "}
        <ExternalLink
          href={OTEL_V4_MIGRATION_URL}
          analytics={{ section: "otel", link: "otel_migration_docs" }}
        >
          Migration guide
        </ExternalLink>
        .
      </p>
      <SdkUsageSeriesRows
        series={section.series}
        projectId={projectId}
        analyticsSection="otel"
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
export function V4MigrationCustomInstrumentationSection({
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

  return (
    <Section
      title="Upgrade Instrumentation"
      analyticsSection="custom_instrumentation"
      count={section.series.length}
      defaultOpen={defaultOpen}
    >
      <p className="text-muted-foreground text-sm leading-relaxed">
        Data is arriving through the ingestion API without a Langfuse SDK
        header, so this looks like custom instrumentation or a very old SDK
        version. Please upgrade to the latest version of{" "}
        <ExternalLink
          href={SDK_OVERVIEW_URL}
          analytics={{
            section: "custom_instrumentation",
            link: "sdk_overview_docs",
          }}
        >
          any Langfuse SDK
        </ExternalLink>
        , or use the{" "}
        <ExternalLink
          href={OTEL_INTEGRATION_URL}
          analytics={{
            section: "custom_instrumentation",
            link: "otel_integration_docs",
          }}
        >
          OpenTelemetry endpoint
        </ExternalLink>
        .
      </p>
      <SdkUsageSeriesRows
        series={section.series}
        projectId={projectId}
        unknownSeriesLabel="Custom instrumentation"
        hideMissingApiKey
        analyticsSection="custom_instrumentation"
        needsAction={() => true}
        suffix={() => null}
      />
    </Section>
  );
}

export function V4MigrationDetectedInstrumentationSection({
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
        These configurations are already on the latest SDK major or use
        real-time OTel ingestion.
      </p>
      <SdkUsageSeriesRows
        series={series}
        projectId={projectId}
        analyticsSection="detected_instrumentation"
        needsAction={() => false}
        suffix={(usage) =>
          usage.remediationType === "update_sdk" ? (
            <span>· up to date</span>
          ) : (
            <span>· real-time</span>
          )
        }
      />
    </Section>
  );
}

// The four checker sections below are presentational (data via props) so the
// state gallery story can render every variant without tRPC or router mocks.

export function V4MigrationEvalsSection({
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
                  <BotMessageSquare className="mr-1.5 h-4 w-4" />
                  Use Assistant
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

export function V4MigrationExperimentsSection({
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
              <ExternalLink
                href={EXPERIMENT_OTEL_INGESTION_URL}
                analytics={{
                  section: "experiments",
                  link: "experiments_otel_docs",
                }}
              >
                OTel experiment instrumentation guide
              </ExternalLink>{" "}
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
              <ExternalLink
                href={SDK_UPGRADE_URL}
                analytics={{ section: "experiments", link: "sdk_upgrade_docs" }}
              >
                Upgrade the SDK
              </ExternalLink>{" "}
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

export function V4MigrationApisSection({
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
            <ExternalLink
              href={DEPRECATED_API_MIGRATION_URL}
              analytics={{ section: "apis", link: "deprecated_api_docs" }}
            >
              migration guide
            </ExternalLink>
          </p>
          <div className="flex flex-col gap-3">
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
                <div key={row.endpoint} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <ExternalLink
                      href={DEPRECATED_API_MIGRATION_URL}
                      className="text-sm"
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
                    </ExternalLink>
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
                    <ul className="mt-2 flex flex-col gap-2">
                      {callers.map((caller, index) => {
                        const codingAgent = getCodingAgentName(
                          caller.userAgent,
                        );
                        const guidance = getApiMigrationGuidance(
                          row.endpoint,
                          caller.sdkName,
                          caller.sdkVersion,
                        );
                        const callerName = caller.isOther
                          ? "Unknown callers"
                          : caller.sdkName
                            ? `Langfuse ${caller.sdkName === "python" ? "Python" : "JavaScript"} SDK${caller.sdkVersion ? ` ${caller.sdkVersion}` : ""}`
                            : codingAgent
                              ? codingAgent
                              : caller.userAgent || "Unknown caller";
                        const callerCount = Math.max(
                          1,
                          Math.round(caller.count),
                        );

                        return (
                          <li
                            key={`${callerName}-${index}`}
                            className="bg-muted/50 border-border rounded-md border-l-4 p-2 text-sm"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                              <div className="text-muted-foreground flex items-center gap-1.5">
                                <span aria-hidden="true">⚠️</span>
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
                                <ExternalLink
                                  href={DEPRECATED_API_MIGRATION_URL}
                                  analytics={{
                                    section: "apis",
                                    link: "deprecated_api_caller_docs",
                                  }}
                                >
                                  See docs.
                                </ExternalLink>
                              </p>
                            ) : guidance.currentMethod &&
                              guidance.replacementMethod ? (
                              <p className="text-muted-foreground mt-1 pl-5 text-xs">
                                Replace{" "}
                                <MonoValue>{guidance.currentMethod}</MonoValue>{" "}
                                with{" "}
                                <MonoValue>
                                  {guidance.replacementMethod}
                                </MonoValue>
                                {guidance.requiresUpgrade &&
                                guidance.minimumVersion ? (
                                  <>
                                    . First upgrade to SDK version{" "}
                                    <MonoValue>
                                      {guidance.minimumVersion} or newer
                                    </MonoValue>
                                  </>
                                ) : null}
                                .{" "}
                                <ExternalLink
                                  href={DEPRECATED_API_MIGRATION_URL}
                                  analytics={{
                                    section: "apis",
                                    link: "deprecated_api_caller_docs",
                                  }}
                                >
                                  See docs.
                                </ExternalLink>
                              </p>
                            ) : (
                              <p className="text-muted-foreground mt-1 pl-5 text-xs">
                                Migrate calls to{" "}
                                <MonoValue>{guidance.replacement}</MonoValue>.{" "}
                                <ExternalLink
                                  href={DEPRECATED_API_MIGRATION_URL}
                                  analytics={{
                                    section: "apis",
                                    link: "deprecated_api_caller_docs",
                                  }}
                                >
                                  See docs.
                                </ExternalLink>
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

export function V4MigrationIntegrationsSection({
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
                <ExternalLink
                  href={
                    DEPRECATED_INTEGRATION_MIGRATION_URLS[name] ?? V4_DOCS_URL
                  }
                  className="text-sm"
                  analytics={{
                    section: "integrations",
                    link: "integration_migration_docs",
                  }}
                >
                  Migration guide
                </ExternalLink>
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

/**
 * Whether this deployment is bound by the dated v3 sunset.
 *
 * `V4_MIGRATION_DEADLINE` is a Langfuse Cloud commitment. On a self-hosted
 * deployment nothing happens on that date — the legacy surfaces keep working
 * until the operator moves the write mode off `dual`, so quoting a date would
 * be plainly wrong. The Fern deprecation messages scope the same date to Cloud
 * for the same reason (see `deprecations.ts`).
 */
export function useHasV4MigrationDeadline(): boolean {
  return useLangfuseCloudRegion().isLangfuseCloud;
}

// Docs link and deadline note are shared by the panel/modal header and the
// account-level status page so both surfaces read the same.
export function V4MigrationDocsLink() {
  return (
    <ExternalLink
      href={V4_DOCS_URL}
      analytics={{ section: "header", link: "v4_docs" }}
    >
      See docs.
    </ExternalLink>
  );
}

/**
 * Headline for the migration surfaces. It names the compatibility deadline
 * rather than a version: the app shell already shows a v4 build number, so a
 * "upgrade to v4" title reads as a contradiction to users whose integrations,
 * not their deployment, are the thing left to update.
 */
export function useV4MigrationTitle(): string {
  return useHasV4MigrationDeadline()
    ? `Ensure compatibility after ${V4_MIGRATION_DEADLINE_SHORT}`
    : "Ensure compatibility";
}

export function V4MigrationDeadlineNote() {
  const hasDeadline = useHasV4MigrationDeadline();

  if (!hasDeadline) {
    return (
      <p>
        Some features may stop working if you don&apos;t update integrations
        before your administrator disables the legacy mode.
      </p>
    );
  }

  return (
    <p>
      After{" "}
      <ExternalLink
        href={V4_TIMELINE_URL}
        analytics={{ section: "header", link: "v4_timeline" }}
      >
        {V4_MIGRATION_DEADLINE}
      </ExternalLink>{" "}
      some features may stop working if you don&apos;t update integrations.
    </p>
  );
}

// Title, status link, and the v4 pitch. The agent CTA lives in
// V4MigrationAgentUpgradeSection, rendered by the details content.
export function V4MigrationHeaderContent({
  titleRowClassName,
  readiness,
}: {
  /** Extra classes on the title row. The modal host passes a right gutter:
   *  its dialog floats a fallback close button over the body's top-right
   *  corner (the title is sr-only, so there is no DialogHeader row), which
   *  would otherwise overlap the title. */
  titleRowClassName?: string;
  /** Known readiness from the organization status page or an action-only entry point. */
  readiness?: ProjectMigrationReadiness;
}) {
  const actionNeeded = readiness === "action-needed";
  const title = useV4MigrationTitle();

  return (
    <>
      <div
        className={cn(
          "mb-1.5 flex items-baseline justify-between gap-2",
          titleRowClassName,
        )}
      >
        <p className="min-w-0 text-lg font-bold">{title}</p>
      </div>
      <div className="text-muted-foreground flex flex-col gap-2 text-sm leading-relaxed">
        <p>
          Langfuse v4 is live: a re-architecture of our data model and database
          tables. It is up to 165× more performant in UI and on APIs. It also
          enables new features such as{" "}
          <ExternalLink
            href={FULL_TEXT_SEARCH_URL}
            analytics={{ section: "header", link: "full_text_search_docs" }}
          >
            full-text search
          </ExternalLink>
          , a{" "}
          <ExternalLink
            href={FILTER_SEARCH_BAR_URL}
            analytics={{ section: "header", link: "filter_search_bar_docs" }}
          >
            new filter search bar
          </ExternalLink>
          ,{" "}
          <ExternalLink
            href={ALERTS_URL}
            analytics={{ section: "header", link: "alerts_docs" }}
          >
            alerts
          </ExternalLink>
          ,{" "}
          <ExternalLink
            href={CODE_EVALUATORS_URL}
            analytics={{ section: "header", link: "code_evaluators_docs" }}
          >
            code evaluators
          </ExternalLink>
          , and the{" "}
          <ExternalLink
            href={LANGFUSE_ASSISTANT_URL}
            analytics={{ section: "header", link: "langfuse_assistant_docs" }}
          >
            Langfuse Assistant
          </ExternalLink>
          .
          {actionNeeded
            ? " Complete the action items below to avoid disruption."
            : ""}{" "}
          <V4MigrationDocsLink />
        </p>
        {actionNeeded && <V4MigrationDeadlineNote />}
      </div>
    </>
  );
}

// The primary agent CTA as its own group. The prompt is always visible so a
// single click on the CTA (or the code block's corner button) copies it.
// Project API keys are NOT created as a side effect: credentials only exist
// after an explicit click on the separate "Create keys for project access"
// action, and secrets never enter the agent prompt.
export function V4MigrationAgentUpgradeSection({
  projectId,
}: {
  projectId?: string;
}) {
  const capture = usePostHogClientCapture();
  const handleCopyPrompt = useCopyMigrationPrompt();

  const [generatedKeys, setGeneratedKeys] = useState<{
    projectId: string;
    secretKey: string;
    publicKey: string;
  } | null>(null);
  const generatedKeysForProject =
    generatedKeys?.projectId === projectId ? generatedKeys : null;

  const utils = api.useUtils();
  const mutCreateProjectApiKey = api.projectApiKeys.create.useMutation({
    onSuccess: () => utils.projectApiKeys.invalidate(),
  });
  const hasApiKeyCreateAccess = useHasProjectAccess({
    projectId,
    scope: "apiKeys:CUD",
  });

  const handleCreateKeys = () => {
    // Guards double-clicks and re-creation once keys exist for this project.
    if (
      !projectId ||
      !hasApiKeyCreateAccess ||
      mutCreateProjectApiKey.isPending ||
      generatedKeysForProject
    )
      return;

    capture("v4_migration:create_project_keys_clicked");
    mutCreateProjectApiKey
      .mutateAsync({
        projectId,
        note: "v4-migration-key",
      })
      .then(({ secretKey, publicKey }) => {
        setGeneratedKeys({
          projectId,
          secretKey,
          publicKey,
        });
        capture(`project_settings:api_key_create`);
      })
      .catch((error) => {
        console.error(error);
        showErrorToast(
          "Could not create API keys",
          "Something went wrong. Please try again.",
        );
      });
  };

  const missingApiKeyAccess = Boolean(projectId) && !hasApiKeyCreateAccess;
  const createKeysButton = (
    <Button
      variant="outline"
      size="sm"
      className="w-fit"
      disabled={missingApiKeyAccess || mutCreateProjectApiKey.isPending}
      onClick={handleCreateKeys}
    >
      Create API keys
    </Button>
  );

  const envBlock = generatedKeysForProject
    ? [
        `LANGFUSE_BASE_URL=${typeof window === "undefined" ? "" : window.location.origin}`,
        `LANGFUSE_PUBLIC_KEY=${generatedKeysForProject.publicKey}`,
        `LANGFUSE_SECRET_KEY=${generatedKeysForProject.secretKey}`,
      ].join("\n")
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-base font-bold">
          Upgrade using coding agents
        </div>
        <p className="text-muted-foreground text-sm">
          Paste prompt into Claude Code or other coding agents
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <RainbowButton className="w-full" onClick={handleCopyPrompt}>
          <Copy className="mr-1.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate" title="Copy prompt">
            Copy prompt
          </span>
        </RainbowButton>
        <CodeBlockWithCopy
          text={V4_CODING_AGENT_PROMPT}
          copyLabel="Copy prompt to clipboard"
          onCopy={() => capture("v4_migration:coding_agent_prompt_copied")}
          scrollable
          className="my-3"
        />
        {projectId && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground min-w-0 text-sm leading-relaxed">
                Create project API keys to give your agent access
              </p>
              {!envBlock &&
                (missingApiKeyAccess ? (
                  // Disabled buttons swallow pointer events, so the hover
                  // reason needs a span trigger, same pattern as ActionButton.
                  <HoverCard openDelay={200}>
                    <HoverCardTrigger asChild>
                      <span className="shrink-0">{createKeysButton}</span>
                    </HoverCardTrigger>
                    <HoverCardPortal>
                      <HoverCardContent className="w-80 text-sm">
                        Only users with admin access can create project API
                        keys. Please contact your admins.
                      </HoverCardContent>
                    </HoverCardPortal>
                  </HoverCard>
                ) : (
                  createKeysButton
                ))}
            </div>
            {envBlock && (
              <CodeBlockWithCopy
                text={envBlock}
                copyLabel="Copy keys"
                onCopy={() => capture("v4_migration:project_keys_copied")}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// The migration checklist sections, agent CTA, compare-traces toggle row, and
// footer links. onNavigate fires when an internal link is followed so the
// hosting surface (panel or modal) can close itself.
export function V4MigrationDetailsContent({
  onNavigate,
  projectId: projectIdProp,
}: {
  onNavigate?: () => void;
  /** Project the content links point at; falls back to the route project. */
  projectId?: string;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const { openWithMode: openSupportDrawerWithMode } = useSupportDrawer();

  const routeProjectId = router.query.projectId;
  const projectId =
    projectIdProp ??
    (typeof routeProjectId === "string" ? routeProjectId : undefined);
  const migrationData = useProjectV4MigrationData({
    projectId,
    enabled: Boolean(projectId),
  });
  const { canToggleV4, isV4 } = useReadPath();
  // Evidence links target the v4 events table; with the v4 preview off the
  // route renders the v3 observations table, which cannot express the
  // ingestionApiKey filter — the link would open an unfiltered table. Keep
  // the key as plain text there instead of a misleading link.
  const evidenceProjectId = isV4 ? projectId : undefined;

  // PostHog is the external system here: the panel's checks resolve
  // asynchronously after open, so the "how much work was shown" event can
  // only fire once they settle; the ref guards refetch-driven re-settles.
  // Settled means no check is still in flight — readiness alone would report
  // "unavailable" the moment one check errors while others are loading, and
  // the event would lock in a mid-flight snapshot.
  const readiness = getProjectMigrationReadiness(migrationData);
  const checksSettled =
    migrationData.sdk.status !== "checking" &&
    migrationData.experiments.status !== "loading" &&
    migrationData.evals.status !== "loading" &&
    migrationData.apis.status !== "loading" &&
    migrationData.exports.status !== "loading";
  const checksLoadedCaptured = useRef(false);
  useEffect(() => {
    if (checksLoadedCaptured.current || !checksSettled) return;
    checksLoadedCaptured.current = true;
    const sdkSection = getSdkSectionState(migrationData.sdk);
    const otelSection = getOtelSectionState(migrationData.sdk);
    const customSection = getCustomInstrumentationSectionState(
      migrationData.sdk,
    );
    // Counts only — never keys, versions, or other row contents. Errored
    // checks report null so they stay distinguishable from a clean zero.
    capture("v4_migration:panel_checks_loaded", {
      readiness,
      sdkStatus: migrationData.sdk.status,
      sdkActionableCount: sdkSection.actionableCount,
      delayedOtelCount: otelSection.delayedCount,
      customInstrumentationCount: customSection.series.length,
      evalsCount:
        migrationData.evals.status === "loaded"
          ? migrationData.evals.count
          : null,
      apisCount:
        migrationData.apis.status === "loaded"
          ? migrationData.apis.count
          : null,
      integrationsCount:
        migrationData.exports.status === "loaded"
          ? migrationData.exports.count
          : null,
      experimentsResult:
        migrationData.experiments.status === "loaded"
          ? migrationData.experiments.result
          : migrationData.experiments.status,
    });
  }, [checksSettled, readiness, migrationData, capture]);

  // Sections in a good state collapse into one summary sentence instead of
  // rendering their own (green) rows. Loading and error states keep the row.
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
  const cleanSectionLabels = [
    evalsClean ? "evals" : null,
    experimentsClean ? "experiments" : null,
    apisClean ? "APIs" : null,
    exportsClean ? "integrations" : null,
  ].filter((label): label is string => label !== null);
  const joinedCleanLabels =
    cleanSectionLabels.length > 1
      ? `${cleanSectionLabels.slice(0, -1).join(", ")} and ${cleanSectionLabels[cleanSectionLabels.length - 1]}`
      : cleanSectionLabels[0];
  const cleanSummary = joinedCleanLabels
    ? `${joinedCleanLabels.charAt(0).toUpperCase()}${joinedCleanLabels.slice(1)} are up to date.`
    : null;

  const handleEmailEngineer = () => {
    capture("v4_migration:contact_support_clicked");
    onNavigate?.();
    openSupportDrawerWithMode("form", { topic: "V4 Migration" });
  };
  const isInAppAgentLauncherVisible = useIsInAppAgentLauncherVisible();
  // Same org source as EvaluatorMigrationDialog's gating, so the button
  // branding and the dialog's preselect can't disagree.
  const { organization: routeOrganization } = useQueryProjectOrOrganization();
  const aiFeaturesEnabled = Boolean(routeOrganization?.aiFeaturesEnabled);
  const [evalMigrationDialogOpen, setEvalMigrationDialogOpen] = useState(false);
  const upgradePlan = useEvalUpgradeAssistantPlan({
    projectId,
    enabled: Boolean(projectId),
  });
  const evalsUrl =
    typeof projectId === "string"
      ? buildDeprecatedRulesUrl(projectId)
      : undefined;
  const handleMigrateEvalsWithAgent = () => {
    capture("v4_migration:migrate_evals_with_agent_clicked");
    setEvalMigrationDialogOpen(true);
  };
  const handleManualEvalUpgrade = () => {
    setEvalMigrationDialogOpen(false);
    onNavigate?.();
    if (evalsUrl) router.push(evalsUrl);
  };
  const integrationsUrl =
    typeof projectId === "string"
      ? `/project/${projectId}/settings/integrations`
      : undefined;

  return (
    <>
      <Separator />

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-base font-bold">
          Action items
        </div>
        <p className="text-muted-foreground text-sm">
          SDK, instrumentation, experiment, and API checks cover activity from
          the last {V4_MIGRATION_LOOKBACK_DAYS} days. API and experiment usage
          counts refresh about every 15 minutes, so recent calls may not appear
          yet.
        </p>
        <div>
          <V4MigrationSdkSection
            sdk={migrationData.sdk}
            projectId={evidenceProjectId}
          />
          <V4MigrationOtelSection
            sdk={migrationData.sdk}
            projectId={evidenceProjectId}
          />
          <V4MigrationCustomInstrumentationSection
            sdk={migrationData.sdk}
            projectId={evidenceProjectId}
          />

          {!evalsClean && (
            <V4MigrationEvalsSection
              state={migrationData.evals}
              assistant={
                isInAppAgentLauncherVisible
                  ? {
                      onMigrate: handleMigrateEvalsWithAgent,
                      aiFeaturesEnabled,
                    }
                  : null
              }
              evalsUrl={evalsUrl}
              onNavigate={onNavigate}
            />
          )}

          {!experimentsClean && (
            <V4MigrationExperimentsSection
              state={migrationData.experiments}
              upgradePath={migrationData.experimentInstrumentationUpgradePath}
            />
          )}

          {!apisClean && (
            <V4MigrationApisSection
              state={migrationData.apis}
              usage={migrationData.apiUsage}
            />
          )}

          {!exportsClean && (
            <V4MigrationIntegrationsSection
              state={migrationData.exports}
              integrations={migrationData.legacyIntegrations}
              integrationsUrl={integrationsUrl}
              onNavigate={onNavigate}
            />
          )}

          {cleanSummary && (
            <p className="text-muted-foreground flex items-center gap-2.5 py-2.5 text-sm">
              <V4MigrationStatusDot variant="done" />
              {cleanSummary}
            </p>
          )}

          <V4MigrationDetectedInstrumentationSection
            sdk={migrationData.sdk}
            projectId={evidenceProjectId}
          />

          {/* Always the last checklist row. Hides itself when the session
              cannot toggle v4 (legacy/events_only write mode, post-rollout
              auto-enrollment). Neutral dot + muted text: an optional helper
              in the settled-summary style, not pending work. */}
          {canToggleV4 && (
            <div className="flex w-full items-center gap-2.5 py-2.5">
              <V4MigrationStatusDot variant="neutral" />
              <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
                Compare traces while you upgrade
                <HoverCard openDelay={200}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      aria-label="Why compare traces?"
                      className="shrink-0"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </HoverCardTrigger>
                  <HoverCardPortal>
                    <HoverCardContent className="w-80 text-sm">
                      The latest SDK no longer sets trace input and output;{" "}
                      <ExternalLink
                        href={OBSERVATIONS_DATA_MODEL_URL}
                        analytics={{
                          section: "compare_row",
                          link: "observations_data_model_docs",
                        }}
                      >
                        v4 infers them from observations
                      </ExternalLink>
                      .
                    </HoverCardContent>
                  </HoverCardPortal>
                </HoverCard>
              </span>
              <span className="flex-1" />
              <V4PreviewToggleRow projectId={projectId} />
            </div>
          )}
        </div>
      </div>

      <Separator />

      <V4MigrationAgentUpgradeSection projectId={projectId} />

      <Separator />

      <div className="flex flex-col gap-2">
        <p className="text-base font-bold">Need help?</p>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <a
            href={V4_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => capture("v4_migration:panel_docs_link_clicked")}
            className="underline"
          >
            Docs
          </a>
          <span>·</span>
          <button
            type="button"
            onClick={handleEmailEngineer}
            className="underline"
          >
            Email an engineer
          </button>
          <span>·</span>
          <a
            href="https://cal.com/team/langfuse/v4-upgrade"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => capture("v4_migration:contact_book_call_clicked")}
            className="underline"
          >
            Book a call
          </a>
          {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && (
            <>
              <span>·</span>
              <a
                href={WALKTHROUGH_VIDEO_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  capture("v4_migration:walkthrough_video_clicked")
                }
                className="underline"
              >
                Walkthrough video
              </a>
            </>
          )}
        </div>
      </div>
      {projectId ? (
        <EvaluatorMigrationDialog
          open={evalMigrationDialogOpen}
          onOpenChange={setEvalMigrationDialogOpen}
          scope={{ type: "all" }}
          initialAction="assistant"
          assistantPrompt={upgradePlan.assistantPrompt}
          onManualUpgrade={handleManualEvalUpgrade}
          onAssistantStarted={() => onNavigate?.()}
        />
      ) : null}
    </>
  );
}
