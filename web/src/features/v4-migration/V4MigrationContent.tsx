/* eslint-disable @repo/no-style-props */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  Bot,
  BotMessageSquare,
  Check,
  ChevronRight,
  Copy,
  Info,
} from "lucide-react";
import { useCanUseInAppAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
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
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { cn } from "@/src/utils/tailwind";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import {
  formatSdkUpgradeRequirement,
  formatSdkVersion,
  getCustomInstrumentationSectionState,
  getOtelSectionState,
  getSdkSectionState,
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
} from "@/src/features/v4-migration/migrationData";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { numberFormatter } from "@/src/utils/numbers";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { useProject } from "@/src/features/projects/hooks";
import { V4PreviewToggleRow } from "@/src/features/events/components/V4SidebarToggle";
import {
  useEvalUpgradeAssistantPlan,
  V4_CODING_AGENT_PROMPT,
} from "@/src/features/v4-migration/useV4UpgradeAssistantSupport";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { EvaluatorMigrationDialog } from "@/src/features/v4-migration/EvaluatorMigrationDialog";
import { buildDeprecatedEvaluatorsUrl } from "@/src/features/v4-migration/evaluatorMigrationUrls";

// Single source of truth for the v4-migration copy and content. Both surfaces
// (side panel and modal) render these components — edit copy here only.

const V4_DOCS_URL = "https://langfuse.com/docs/v4";
// Consumed by the status page deadline copy.
export const V4_MIGRATION_DEADLINE = "Oct 9";
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
// The docs ship one combined SDK page; Python and JS have no standalone
// landing pages to deep-link.
const SDK_OVERVIEW_URL = "https://langfuse.com/docs/observability/sdk/overview";
const OTEL_INTEGRATION_URL =
  "https://langfuse.com/integrations/native/opentelemetry";

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
}: {
  title: string;
  /** Number of affected items, shown muted after the title. */
  count?: number;
  /** Right-aligned muted text for transient states (checking, failed). */
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2.5 py-2.5 text-left">
        {/* A rendered section always needs the user to act (clean ones hide
            themselves); same dot as the action-required badge. */}
        <V4MigrationStatusDot variant="action" />
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
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
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("underline", className)}
    >
      {children}
    </a>
  );
}

// Evidence deep-link filter for one SDK usage series: always the exact public
// key, plus the ingestion SDK name/version when the series carries exact
// values — so two SDK versions on the same key link to distinct result sets.
// "unknown" is the attribution fallback bucket, not an exact value, so those
// dimensions fall back to key-only. The delayed-OTel `source` dimension is
// deliberately not linked either: it is a prefix match, not an exact one.
function buildSdkUsageEvidenceFilter(usage: V4MigrationSdkUsageSeries): string {
  const filters: FilterState = [
    {
      column: "ingestionApiKey",
      type: "stringOptions",
      operator: "any of",
      value: [usage.publicKey],
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
  unknownSeriesLabel = "OTLP exporter",
  projectId,
  onNavigate,
}: {
  series: V4MigrationSdkUsageSeries[];
  /** Drives the per-row status emoji; the suffix carries the text meaning. */
  needsAction: (series: V4MigrationSdkUsageSeries) => boolean;
  suffix: (series: V4MigrationSdkUsageSeries) => ReactNode;
  /** Row label when the series carries no usable SDK name. */
  unknownSeriesLabel?: string;
  /** Enables the evidence deep link on the public key. */
  projectId?: string;
  onNavigate?: () => void;
}) {
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
        const publicKey =
          usage.publicKey.length > 18
            ? `${usage.publicKey.slice(0, 9)}…${usage.publicKey.slice(-6)}`
            : usage.publicKey || "No API key";

        return (
          <li
            key={`${usage.sdkName}:${usage.sdkVersion}:${usage.publicKey}`}
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
              {/* Deep link to the exact evidence: the events table filtered by
                  this public key (plus SDK name/version when attributed) over
                  the same lookback window the detection used; see
                  buildSdkUsageEvidenceFilter. Scores-only offenders
                  (eventsCount 0) stay plain text — the events table has
                  nothing for them and a link would open an empty result. */}
              {projectId && usage.publicKey && usage.eventsCount > 0 ? (
                <Link
                  // The events page's `filter` param carries the semicolon
                  // filter encoding (column;type;key;operator;value), not the
                  // search-bar grammar; the bar re-derives its text from it.
                  href={`/project/${projectId}/observations?filter=${encodeURIComponent(
                    buildSdkUsageEvidenceFilter(usage),
                  )}&dateRange=${V4_MIGRATION_LOOKBACK_DAYS}d`}
                  onClick={onNavigate}
                  className="underline"
                  title={usage.publicKey}
                >
                  {publicKey}
                </Link>
              ) : (
                <span title={usage.publicKey || undefined}>{publicKey}</span>
              )}
              <span>
                · last seen{" "}
                {formatCompactRelativeTime(new Date(usage.lastSeen))}
              </span>
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
  onNavigate,
}: {
  sdk: V4MigrationSdkState;
  defaultOpen?: boolean;
  projectId?: string;
  onNavigate?: () => void;
}) {
  const section = getSdkSectionState(sdk);
  if (section.status === "latest" || section.status === "no_data") return null;

  const isTransient =
    section.status === "checking" || section.status === "error";

  return (
    <Section
      title="Update SDK"
      count={isTransient ? undefined : section.actionableCount}
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
            an update. See{" "}
            <ExternalLink href={SDK_UPGRADE_URL}>upgrade path</ExternalLink>.
          </>
        )}
      </p>
      <SdkUsageSeriesRows
        series={section.series}
        projectId={projectId}
        onNavigate={onNavigate}
        needsAction={(usage) =>
          (usage.v4MigrationStatus === "upgrade_required" &&
            !usage.upgradeCompleted) ||
          usage.v4MigrationStatus === "unknown"
        }
        suffix={(usage) =>
          usage.v4MigrationStatus === "upgrade_required" &&
          !usage.upgradeCompleted ? (
            <span>· {formatSdkUpgradeRequirement(usage.canonicalSdkName)}</span>
          ) : usage.upgradeCompleted ? (
            <span>· upgrade completed</span>
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
  onNavigate,
}: {
  sdk: V4MigrationSdkState;
  defaultOpen?: boolean;
  projectId?: string;
  onNavigate?: () => void;
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
      count={section.delayedCount}
      defaultOpen={defaultOpen}
    >
      <p className="text-muted-foreground text-sm leading-relaxed">
        OTel data is arriving through the delayed ingestion path. Set the{" "}
        <MonoValue>x-langfuse-ingestion-version</MonoValue> header to{" "}
        <MonoValue>4</MonoValue> on the OTLP exporter to use real-time
        ingestion.{" "}
        <ExternalLink href={OTEL_V4_MIGRATION_URL}>
          OpenTelemetry migration guide
        </ExternalLink>
        .
      </p>
      <SdkUsageSeriesRows
        series={section.series}
        projectId={projectId}
        onNavigate={onNavigate}
        needsAction={(usage) => usage.hasDelayedOtelEvents === true}
        suffix={(usage) =>
          usage.hasDelayedOtelEvents === true ? (
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
  onNavigate,
}: {
  sdk: V4MigrationSdkState;
  defaultOpen?: boolean;
  projectId?: string;
  onNavigate?: () => void;
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
      count={section.series.length}
      defaultOpen={defaultOpen}
    >
      <p className="text-muted-foreground text-sm leading-relaxed">
        Data is arriving through the ingestion API without a Langfuse SDK
        header, so this looks like custom instrumentation or a very old SDK
        version. Please upgrade to one of our latest{" "}
        <ExternalLink href={SDK_OVERVIEW_URL}>Python or JS SDK</ExternalLink>{" "}
        versions, or use the{" "}
        <ExternalLink href={OTEL_INTEGRATION_URL}>
          OpenTelemetry endpoint
        </ExternalLink>
        .
      </p>
      <SdkUsageSeriesRows
        series={section.series}
        projectId={projectId}
        onNavigate={onNavigate}
        unknownSeriesLabel="Custom instrumentation"
        needsAction={() => true}
        suffix={() => null}
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
  /** Assistant CTA; null hides the button. */
  assistant: { onMigrate: () => void } | null;
  evalsUrl?: string;
  onNavigate?: () => void;
  defaultOpen?: boolean;
}) {
  return (
    <Section
      title="Repoint Evals"
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
              <Link href={evalsUrl} onClick={onNavigate} className="underline">
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
            , which v4 no longer sets. Repoint{" "}
            {state.count === 1 ? "it" : "them"} at observations.
          </p>
          {assistant && (
            <Button variant="outline" size="sm" onClick={assistant.onMigrate}>
              <BotMessageSquare className="mr-1.5 h-4 w-4" />
              Use Assistant
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
              <ExternalLink href={EXPERIMENT_OTEL_INGESTION_URL}>
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
              <ExternalLink href={SDK_UPGRADE_URL}>
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
  usage: { endpoint: string; count: number; lastSeen: string }[];
  defaultOpen?: boolean;
}) {
  return (
    <Section
      title="Migrate APIs"
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
            You&apos;ve called these deprecated endpoints in the last{" "}
            {V4_MIGRATION_LOOKBACK_DAYS} days. They stop working soon; the{" "}
            <ExternalLink href={DEPRECATED_API_MIGRATION_URL}>
              migration guide
            </ExternalLink>{" "}
            maps each endpoint to its replacement.
          </p>
          <div className="flex flex-col">
            {usage.map((row) => (
              <div
                key={row.endpoint}
                className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-x-2 py-0.5"
              >
                <ExternalLink
                  href={DEPRECATED_API_MIGRATION_URL}
                  className="text-sm"
                >
                  {row.endpoint}
                </ExternalLink>
                <span
                  className="text-muted-foreground text-sm whitespace-nowrap"
                  title={`Last seen at ${row.lastSeen}`}
                >
                  {numberFormatter(row.count, 0, 2)} calls · last seen{" "}
                  {formatCompactRelativeTime(new Date(row.lastSeen))}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          No deprecated public API usage detected in the last{" "}
          {V4_MIGRATION_LOOKBACK_DAYS} days.
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
  return (
    <Section
      title="Migrate Integrations"
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
                    onClick={onNavigate}
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

// Title, status link, and the v4 pitch. The agent CTA lives in
// V4MigrationAgentUpgradeSection, rendered by the details content.
export function V4MigrationHeaderContent({
  projectName,
  projectId,
  titleRowClassName,
}: {
  projectName?: string;
  projectId?: string;
  /** Extra classes on the title row. The modal host passes a right gutter:
   *  its dialog floats a fallback close button over the body's top-right
   *  corner (the title is sr-only, so there is no DialogHeader row), which
   *  would otherwise overlap the title. */
  titleRowClassName?: string;
}) {
  // Same queries as V4MigrationDetailsContent below, so react-query dedupes
  // them. Only claim the project needs migrating once the checks confirm it —
  // a fully migrated project shows the v4 value prop without a status claim.
  const { organization } = useProject(projectId ?? null);
  const migrationData = useProjectV4MigrationData({
    projectId,
    orgId: organization?.id,
    enabled: Boolean(projectId),
  });
  const needsMigration =
    Boolean(projectId) &&
    getProjectMigrationReadiness(migrationData) === "action-needed";

  return (
    <>
      <div
        className={cn(
          "mb-1.5 flex items-baseline justify-between gap-2",
          titleRowClassName,
        )}
      >
        <p className="min-w-0 text-lg font-bold">
          {projectName ? <>Migrate {projectName} to v4</> : "Migrate to v4"}
        </p>
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {/* Only claim the setup is outdated once the checks confirm it. */}
        {needsMigration && "Your setup is outdated. "}
        Upgrade to Langfuse v4 for{" "}
        <ExternalLink href={V4_DOCS_URL}>real-time ingestion</ExternalLink> and
        up to 165× faster queries.
      </p>
    </>
  );
}

// The primary agent CTA as its own group. The CTA is two-step: the first
// click reveals the prompt so users can see what they hand to their agent,
// the second click copies it. Project API keys are NOT created as a side
// effect: credentials only exist after an explicit click on the separate
// "Create keys for project access" action, and secrets never enter the
// agent prompt.
export function V4MigrationAgentUpgradeSection({
  projectId,
}: {
  projectId?: string;
}) {
  const capture = usePostHogClientCapture();
  const handleCopyPrompt = useCopyMigrationPrompt();
  const [promptVisible, setPromptVisible] = useState(false);

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

  const handleShowPrompt = () => {
    capture("v4_migration:coding_agent_prompt_viewed");
    setPromptVisible(true);
  };

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
          Auto-upgrade with agents
        </div>
        <p className="text-muted-foreground text-sm">
          Paste prompt into Claude Code or other coding agents
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <RainbowButton
          className="w-full"
          onClick={promptVisible ? handleCopyPrompt : handleShowPrompt}
        >
          {promptVisible ? (
            <Copy className="mr-1.5 h-4 w-4 shrink-0" />
          ) : (
            <Bot className="mr-1.5 h-4 w-4 shrink-0" />
          )}
          <span className="min-w-0 truncate" title="Copy prompt">
            Copy prompt
          </span>
        </RainbowButton>
        {promptVisible && (
          <CodeBlockWithCopy
            text={V4_CODING_AGENT_PROMPT}
            copyLabel="Copy prompt to clipboard"
            onCopy={() => capture("v4_migration:coding_agent_prompt_copied")}
            scrollable
            className="my-3"
          />
        )}
        {promptVisible && projectId && (
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
              <CodeBlockWithCopy text={envBlock} copyLabel="Copy keys" />
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
  const { organization } = useProject(projectId ?? null);
  const migrationData = useProjectV4MigrationData({
    projectId,
    orgId: organization?.id,
    enabled: Boolean(projectId),
  });
  const { canToggleV4, isBetaEnabled } = useV4Beta();
  // Evidence links target the v4 events table; with the v4 preview off the
  // route renders the v3 observations table, which cannot express the
  // ingestionApiKey filter — the link would open an unfiltered table. Keep
  // the key as plain text there instead of a misleading link.
  const evidenceProjectId = isBetaEnabled ? projectId : undefined;

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
  const canUseAssistant = useCanUseInAppAgent();
  const [evalMigrationDialogOpen, setEvalMigrationDialogOpen] = useState(false);
  const upgradePlan = useEvalUpgradeAssistantPlan({
    projectId,
    orgId: organization?.id,
    enabled: Boolean(projectId),
  });
  const evalsUrl =
    typeof projectId === "string"
      ? buildDeprecatedEvaluatorsUrl(projectId)
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
        <div>
          <V4MigrationSdkSection
            sdk={migrationData.sdk}
            projectId={evidenceProjectId}
            onNavigate={onNavigate}
          />
          <V4MigrationOtelSection
            sdk={migrationData.sdk}
            projectId={evidenceProjectId}
            onNavigate={onNavigate}
          />
          <V4MigrationCustomInstrumentationSection
            sdk={migrationData.sdk}
            projectId={evidenceProjectId}
            onNavigate={onNavigate}
          />

          {!evalsClean && (
            <V4MigrationEvalsSection
              state={migrationData.evals}
              assistant={
                canUseAssistant
                  ? { onMigrate: handleMigrateEvalsWithAgent }
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
        </div>
      </div>

      <Separator />

      <V4MigrationAgentUpgradeSection projectId={projectId} />

      {/* The toggle row hides itself when the session cannot toggle v4
          (legacy/events_only write mode, post-rollout auto-enrollment), so the
          copy describing it must hide on the same condition. */}
      {canToggleV4 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
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
                    <ExternalLink href={OBSERVATIONS_DATA_MODEL_URL}>
                      v4 infers them from observations
                    </ExternalLink>
                    .
                  </HoverCardContent>
                </HoverCardPortal>
              </HoverCard>
            </p>
            <V4PreviewToggleRow projectId={projectId} />
          </div>
        </>
      )}

      <Separator />

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
      </div>
      {projectId ? (
        <EvaluatorMigrationDialog
          open={evalMigrationDialogOpen}
          onOpenChange={setEvalMigrationDialogOpen}
          scope={{ type: "all" }}
          assistantPrompt={upgradePlan.assistantPrompt}
          onManualUpgrade={handleManualEvalUpgrade}
          onAssistantStarted={() => onNavigate?.()}
        />
      ) : null}
    </>
  );
}
