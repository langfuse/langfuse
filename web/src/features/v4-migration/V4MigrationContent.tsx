import { type ReactNode, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  BotMessageSquare,
  ChevronRight,
  Copy,
  LibraryBig,
  LifeBuoy,
  TriangleAlert,
} from "lucide-react";
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { Button } from "@/src/components/ui/button";
import { RainbowButton } from "@/src/components/magicui/rainbow-button";
import { Separator } from "@/src/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { cn } from "@/src/utils/tailwind";
import {
  formatSdkUpgradeRequirement,
  formatSdkVersion,
  type V4MigrationSdkState,
} from "@/src/features/v4-migration/sdkVersionStatus";
import { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import {
  getProjectMigrationReadiness,
  V4_MIGRATION_LOOKBACK_DAYS,
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

// Single source of truth for the v4-migration copy and content. Both surfaces
// (side panel and modal) render these components — edit copy here only.

const V4_DOCS_URL = "https://langfuse.com/docs/v4";
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

// Copies the agent migration prompt to the clipboard with toast + analytics;
// shared by the panel/modal header CTA and the status page.
export function useCopyMigrationPrompt() {
  const capture = usePostHogClientCapture();

  return async () => {
    capture("v4_migration:coding_agent_prompt_copied");
    await navigator.clipboard.writeText(V4_CODING_AGENT_PROMPT);
    showSuccessToast({
      title: "Prompt copied",
      description: "Paste it into Cursor, Codex, or another coding agent.",
    });
  };
}

function Chip({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "warning" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap",
        variant === "warning"
          ? "bg-light-yellow text-dark-yellow"
          : "bg-light-green text-dark-green",
      )}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  chip,
  children,
}: {
  title: string;
  chip: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center gap-2.5 py-1.5 text-left">
        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className="flex-1 text-sm">{title}</span>
        {chip}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-0.5 pb-3.5 pl-6.5">{children}</div>
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
      className={cn("text-dark-blue hover:underline", className)}
    >
      {children}
    </a>
  );
}

function MigrationCountChip({
  state,
  affectedLabel,
}: {
  state: MigrationCountState;
  affectedLabel: string;
}) {
  if (state.status === "loading") {
    return <Chip variant="warning">Checking</Chip>;
  }
  if (state.status === "error") {
    return <Chip variant="warning">Check failed</Chip>;
  }
  if (state.count === 0) {
    return <Chip variant="success">Up to date</Chip>;
  }
  return (
    <Chip variant="warning">
      {state.count} {affectedLabel}
    </Chip>
  );
}

function V4MigrationSdkSection({ sdk }: { sdk: V4MigrationSdkState }) {
  const detectedSdkSeries = sdk.sdkUsageSeries.filter(
    (series) => series.canonicalSdkName !== null,
  );
  const chip =
    sdk.status === "latest" ? (
      <Chip variant="success">Up to date</Chip>
    ) : sdk.status === "otel_realtime" ? (
      <Chip variant="success">OTel real-time</Chip>
    ) : sdk.status === "no_data" ? (
      <Chip variant="success">No data detected</Chip>
    ) : sdk.status === "checking" ? (
      <Chip variant="warning">Checking</Chip>
    ) : sdk.status === "otel_header_required" ? (
      <Chip variant="warning">OTel header required</Chip>
    ) : sdk.status === "unknown" ? (
      <Chip variant="warning">Needs review</Chip>
    ) : sdk.status === "error" ? (
      <Chip variant="warning">Check failed</Chip>
    ) : (
      <Chip variant="warning">{sdk.upgradeRequiredCount} outdated</Chip>
    );

  return (
    <Section title="Tracing Instrumentation" chip={chip}>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {sdk.status === "checking" ? (
          "Checking the latest traces for this project…"
        ) : sdk.status === "otel_header_required" ? (
          <>
            OTel data is arriving through the delayed ingestion path. Set the{" "}
            <MonoValue>x-langfuse-ingestion-version</MonoValue> header to{" "}
            <MonoValue>4</MonoValue> on the OTLP exporter to use real-time
            ingestion.{" "}
            <ExternalLink href={OTEL_V4_MIGRATION_URL}>
              OpenTelemetry migration guide
            </ExternalLink>
            .
          </>
        ) : sdk.status === "otel_realtime" ? (
          "OTel data is using real-time ingestion. No ingestion header update is required."
        ) : sdk.status === "no_data" ? (
          `No ingestion data was detected in the last ${V4_MIGRATION_LOOKBACK_DAYS} days.`
        ) : sdk.status === "unknown" ? (
          "We could not recognize every detected SDK version. Verify that these SDKs are up to date."
        ) : sdk.status === "error" ? (
          "We could not check the latest traces for this project. Try again later."
        ) : sdk.status === "latest" ? (
          "All detected Langfuse SDK versions are up to date."
        ) : (
          <>
            {sdk.upgradeRequiredCount} detected SDK{" "}
            {sdk.upgradeRequiredCount === 1
              ? "configuration needs"
              : "configurations need"}{" "}
            an update.{" "}
            <ExternalLink href={SDK_UPGRADE_URL}>Upgrade the SDK</ExternalLink>{" "}
            for real-time data and the latest tracing experience.
          </>
        )}
      </p>
      {detectedSdkSeries.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {detectedSdkSeries.map((series) => {
            const sdkLabel = formatSdkVersion({
              language: series.canonicalSdkName ?? series.sdkName,
              version: series.sdkVersion,
            });
            const publicKey =
              series.publicKey.length > 18
                ? `${series.publicKey.slice(0, 9)}…${series.publicKey.slice(-6)}`
                : series.publicKey || "No API key";

            return (
              <li
                key={`${series.sdkName}:${series.sdkVersion}:${series.publicKey}`}
                className="text-muted-foreground flex flex-wrap items-baseline gap-x-1.5 text-xs"
              >
                <MonoValue>{sdkLabel}</MonoValue>
                <span title={series.publicKey || undefined}>{publicKey}</span>
                <span>
                  · last seen{" "}
                  {formatCompactRelativeTime(new Date(series.lastSeen))}
                </span>
                {series.v4MigrationStatus === "upgrade_required" &&
                  !series.upgradeCompleted && (
                    <span className="text-dark-yellow">
                      · {formatSdkUpgradeRequirement(series.canonicalSdkName)}
                    </span>
                  )}
                {series.upgradeCompleted && <span>· upgrade completed</span>}
                {series.v4MigrationStatus === "unknown" && (
                  <span className="text-dark-yellow">
                    · version not recognized
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// Title, description, and the primary agent CTA. The CTA is two-step: the
// first click reveals the prompt so users can see what they hand to their
// agent, the second click copies it.
export function V4MigrationHeaderContent({
  projectName,
  projectId,
  onNavigate,
  titleRowClassName,
}: {
  projectName?: string;
  projectId?: string;
  /** Fires when an internal link is followed so the surface can close. */
  onNavigate?: () => void;
  /** Extra classes on the title row. The modal host passes a right gutter:
   *  its dialog floats a fallback close button over the body's top-right
   *  corner (the title is sr-only, so there is no DialogHeader row), which
   *  would otherwise overlap the right-aligned status link. */
  titleRowClassName?: string;
}) {
  const capture = usePostHogClientCapture();
  const handleCopyPrompt = useCopyMigrationPrompt();
  const [promptVisible, setPromptVisible] = useState(false);

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

  const handleShowPrompt = () => {
    capture("v4_migration:coding_agent_prompt_viewed");
    setPromptVisible(true);
  };

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
        <Link
          href="/v4-migration"
          onClick={() => {
            capture("v4_migration:panel_status_link_clicked");
            onNavigate?.();
          }}
          className="shrink-0 text-sm underline"
        >
          View Status
        </Link>
      </div>
      <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
        <ExternalLink href={V4_DOCS_URL} className="text-inherit underline">
          Langfuse v4
        </ExternalLink>{" "}
        is here: real-time, up to 165× faster, plus new dashboards, alerting,
        sessions, and trace view.
        {needsMigration &&
          " This project still uses the previous setup, which stops working soon."}
      </p>
      <div className="flex flex-col gap-2">
        {promptVisible && (
          <div className="bg-muted/50 max-h-44 overflow-y-auto rounded-md border p-3">
            <code className="text-muted-foreground font-mono text-xs leading-5 break-words whitespace-pre-wrap">
              {V4_CODING_AGENT_PROMPT}
            </code>
          </div>
        )}
        <RainbowButton
          className="w-full"
          onClick={promptVisible ? handleCopyPrompt : handleShowPrompt}
        >
          {promptVisible ? (
            <>
              <Copy className="mr-1.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate" title="Copy prompt">
                Copy prompt
              </span>
            </>
          ) : (
            <span className="min-w-0 truncate" title="Update SDK with agents">
              Update SDK with agents
            </span>
          )}
        </RainbowButton>
      </div>
    </>
  );
}

// The "Want to review first?" and "What happens if I don't update" groups.
// onNavigate fires when an internal link is followed so the hosting surface
// (panel or modal) can close itself.
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
  const { canToggleV4 } = useV4Beta();

  const handleEmailEngineer = () => {
    capture("v4_migration:contact_support_clicked");
    onNavigate?.();
    openSupportDrawerWithMode("form", { topic: "V4 Migration" });
  };
  const { setOpen: setAgentOpen, submit: submitAgentMessage } =
    useInAppAiAgent();
  const upgradePlan = useEvalUpgradeAssistantPlan({
    projectId,
    orgId: organization?.id,
    enabled: Boolean(projectId),
  });
  const evalsUrl =
    typeof projectId === "string" ? `/project/${projectId}/evals` : undefined;
  const handleMigrateEvalsWithAgent = async () => {
    capture("v4_migration:migrate_evals_with_agent_clicked");
    onNavigate?.();
    if (evalsUrl) {
      await router.push(evalsUrl).catch(() => undefined);
    }
    setAgentOpen(true);
    await submitAgentMessage(upgradePlan.assistantPrompt, {
      newConversation: true,
    });
  };
  const integrationsUrl =
    typeof projectId === "string"
      ? `/project/${projectId}/settings/integrations`
      : undefined;

  return (
    <>
      {/* The toggle row hides itself when the session cannot toggle v4
          (legacy/events_only write mode, post-rollout auto-enrollment), so the
          copy describing it must hide on the same condition. */}
      {canToggleV4 && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-base font-bold">
                <LibraryBig className="h-4 w-4 shrink-0" /> Want to review
                first?
              </div>
              <V4PreviewToggleRow projectId={projectId} />
            </div>
            <p className="text-muted-foreground text-sm">
              The latest SDK no longer sets trace input and output; v4{" "}
              <ExternalLink
                href={OBSERVATIONS_DATA_MODEL_URL}
                className="text-inherit underline"
              >
                infers them from observations
              </ExternalLink>
              . Use this toggle to compare both views while you upgrade.
            </p>
          </div>

          <Separator />
        </>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-base font-bold">
            <TriangleAlert className="h-4 w-4 shrink-0" /> What happens if I
            don&apos;t update?
          </div>
          <a
            href={V4_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => capture("v4_migration:panel_docs_link_clicked")}
            className="text-foreground shrink-0 text-sm underline"
          >
            Documentation
          </a>
        </div>
        <p className="text-muted-foreground text-sm">
          Some features will stop working soon.
        </p>
        <div>
          <V4MigrationSdkSection sdk={migrationData.sdk} />

          <Section
            title="Evals"
            chip={
              <MigrationCountChip
                state={migrationData.evals}
                affectedLabel="deprecated"
              />
            }
          >
            {migrationData.evals.status === "loading" ? (
              <p className="text-muted-foreground text-sm">
                Checking configured evals…
              </p>
            ) : migrationData.evals.status === "error" ? (
              <p className="text-muted-foreground text-sm">
                We could not check configured evals. Try again later.
              </p>
            ) : migrationData.evals.count > 0 ? (
              <>
                <p className="text-muted-foreground mb-2 text-sm">
                  {migrationData.evals.count} configured{" "}
                  {migrationData.evals.count === 1
                    ? "eval targets"
                    : "evals target"}{" "}
                  trace input/output, which{" "}
                  <span className="text-dark-yellow">
                    {migrationData.evals.count === 1 ? "stops" : "stop"} running
                    soon
                  </span>
                  . Repointing {migrationData.evals.count === 1 ? "it" : "them"}{" "}
                  at observations or experiments requires minimal changes
                  {upgradePlan.showAssistantButton
                    ? upgradePlan.mode === "evals-ready"
                      ? " — the assistant can do it for you"
                      : " — the assistant can help you choose the upgrade order"
                    : ""}
                  .
                </p>
                <div className="flex items-center gap-3">
                  {upgradePlan.showAssistantButton && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleMigrateEvalsWithAgent}
                    >
                      <BotMessageSquare className="mr-1.5 h-4 w-4" />
                      Migrate with assistant
                    </Button>
                  )}
                  {evalsUrl ? (
                    <Link
                      href={evalsUrl}
                      onClick={onNavigate}
                      className="text-dark-blue text-sm hover:underline"
                    >
                      Review deprecated evals
                    </Link>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No deprecated evals detected.
              </p>
            )}
          </Section>

          <Section
            title="Deprecated APIs"
            chip={
              <MigrationCountChip
                state={migrationData.apis}
                affectedLabel="deprecated"
              />
            }
          >
            {migrationData.apis.status === "loading" ? (
              <p className="text-muted-foreground text-sm">
                Checking public API usage…
              </p>
            ) : migrationData.apis.status === "error" ? (
              <p className="text-muted-foreground text-sm">
                We could not check public API usage. Try again later.
              </p>
            ) : migrationData.apiUsage.length > 0 ? (
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
                  {migrationData.apiUsage.map((usage) => (
                    <div
                      key={usage.endpoint}
                      className="flex flex-wrap items-baseline justify-between gap-x-2 py-0.5"
                    >
                      <ExternalLink
                        href={DEPRECATED_API_MIGRATION_URL}
                        className="text-sm"
                      >
                        {usage.endpoint}
                      </ExternalLink>
                      <span
                        className="text-muted-foreground text-xs whitespace-nowrap"
                        title={`Last seen at ${usage.lastSeen}`}
                      >
                        {numberFormatter(usage.count, 0, 2)} calls · last seen{" "}
                        {formatCompactRelativeTime(new Date(usage.lastSeen))}
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

          <Section
            title="Deprecated Integrations"
            chip={
              <MigrationCountChip
                state={migrationData.exports}
                affectedLabel="deprecated"
              />
            }
          >
            {migrationData.exports.status === "loading" ? (
              <p className="text-muted-foreground text-sm">
                Checking integrations…
              </p>
            ) : migrationData.exports.status === "error" ? (
              <p className="text-muted-foreground text-sm">
                We could not check integrations. Try again later.
              </p>
            ) : migrationData.legacyIntegrations.length > 0 ? (
              <>
                <p className="text-muted-foreground mb-2 text-sm">
                  These exports still read from the old data source. Switching
                  them over can change what downstream consumers receive, so
                  worth a quick check.
                </p>
                <div className="flex flex-col">
                  {migrationData.legacyIntegrations.map((name) => (
                    <div
                      key={name}
                      className="flex items-baseline gap-1.5 py-0.5"
                    >
                      {integrationsUrl ? (
                        <Link
                          href={integrationsUrl}
                          onClick={onNavigate}
                          className="text-dark-blue text-sm hover:underline"
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className="text-sm">{name}</span>
                      )}
                      <span className="text-muted-foreground text-xs">·</span>
                      <ExternalLink
                        href={
                          DEPRECATED_INTEGRATION_MIGRATION_URLS[name] ??
                          V4_DOCS_URL
                        }
                        className="text-xs"
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
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-base font-bold">
          <LifeBuoy className="h-4 w-4 shrink-0" /> Contact us
        </div>
        <p className="text-muted-foreground text-sm">
          Need a hand with the update? We&apos;re here to help!
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild className="min-w-0 flex-1">
            <a
              href="https://cal.com/team/langfuse/welcome-to-langfuse"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => capture("v4_migration:contact_book_call_clicked")}
            >
              <span className="min-w-0 truncate" title="Book a call">
                Book a call
              </span>
            </a>
          </Button>
          <Button
            variant="outline"
            className="min-w-0 flex-1"
            onClick={handleEmailEngineer}
          >
            <span className="min-w-0 truncate" title="Email an Engineer">
              Email an Engineer
            </span>
          </Button>
        </div>
      </div>
    </>
  );
}
