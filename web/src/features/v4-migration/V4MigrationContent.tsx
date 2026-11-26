/* eslint-disable @repo/component-file-structure */
/* eslint-disable @repo/no-style-props */
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Check, Copy, Info } from "@langfuse/icons";
import { env } from "@/src/env.mjs";
import { useIsInAppAgentLauncherVisible } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { Button } from "@/src/components/ui/button";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { RainbowButton } from "@/src/components/magicui/RainbowButton";
import { Separator } from "@/src/components/ui/separator";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import {
  getCustomInstrumentationSectionState,
  getMigratedKeySeries,
  getOtelSectionState,
  getSdkSectionState,
} from "@/src/features/v4-migration/sdkVersionStatus";
import { V4MigrationStatusDot } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import {
  getProjectMigrationReadiness,
  V4_MIGRATION_LOOKBACK_DAYS,
  type ProjectMigrationReadiness,
  type ProjectMigrationStatus,
} from "@/src/features/v4-migration/migrationData";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { V4PreviewToggleRow } from "@/src/features/events/components/V4SidebarToggle";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import {
  useEvalUpgradeAssistantPlan,
  V4_CODING_AGENT_PROMPT,
} from "@/src/features/v4-migration/useV4UpgradeAssistantSupport";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { EvaluatorMigrationDialog } from "@/src/features/v4-migration/EvaluatorMigrationDialog";
import { buildDeprecatedRulesUrl } from "@/src/features/v4-migration/evaluatorMigrationUrls";
import { V4MigrationChecklist } from "./V4MigrationChecklist";
import { V4MigrationExternalLink } from "./V4MigrationExternalLink";
import { V4_DOCS_URL } from "./constants";

// Single source of truth for the v4-migration copy and content. Both surfaces
// (side panel and modal) render these components — edit copy here only.

const V4_TIMELINE_URL = `${V4_DOCS_URL}#timeline`;
const OBSERVATIONS_DATA_MODEL_URL =
  "https://langfuse.com/docs/observability/data-model#observations-and-traces";
// Consumed by the status page and the legacy UI strip. Cloud removal date.
export const V4_MIGRATION_DEADLINE = "November 19, 2026";
// Headline form of the deadline; the year is noise in a title.
const V4_MIGRATION_DEADLINE_SHORT = "November 19";
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
      operation: "prompt.copy",
      title: "Prompt copied",
      description: "Paste it into Cursor, Codex, or another coding agent.",
    });
  };
}

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
          <Check size="base" color="default" />
        ) : (
          <Copy size="base" color="default" />
        )}
      </Button>
    </div>
  );
}

// True when the only checklist rows still inside the lookback are keys that
// already send on the new ingestion API. Readiness and the banner stay as
// they are; this only changes the panel copy.
export function allRemainingActionsAreMigratedKeys(
  status: ProjectMigrationStatus,
): boolean {
  if (getMigratedKeySeries(status.sdk).length === 0) return false;
  if (
    status.sdk.status === "checking" ||
    status.sdk.status === "error" ||
    getSdkSectionState(status.sdk).actionableCount > 0 ||
    getOtelSectionState(status.sdk).pendingCount > 0 ||
    getCustomInstrumentationSectionState(status.sdk).actionableCount > 0
  ) {
    return false;
  }
  return (
    status.evals.status === "loaded" &&
    status.evals.count === 0 &&
    status.experiments.status === "loaded" &&
    status.experiments.result === "not_required" &&
    status.apis.status === "loaded" &&
    status.apis.count === 0 &&
    status.exports.status === "loaded" &&
    status.exports.count === 0
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
    <V4MigrationExternalLink
      href={V4_DOCS_URL}
      analytics={{ section: "header", link: "v4_docs" }}
    >
      See docs.
    </V4MigrationExternalLink>
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
      <V4MigrationExternalLink
        href={V4_TIMELINE_URL}
        analytics={{ section: "header", link: "v4_timeline" }}
      >
        {V4_MIGRATION_DEADLINE}
      </V4MigrationExternalLink>{" "}
      some features may stop working if you don&apos;t update integrations.
    </p>
  );
}

// Title, status link, and the v4 pitch. The agent CTA lives in
// V4MigrationAgentUpgradeSection, rendered by the details content.
export function V4MigrationHeaderContent({
  titleRowClassName,
  readiness,
  remainingActionsAreMigrated = false,
}: {
  /** Extra classes on the title row. The modal host passes a right gutter:
   *  its dialog floats a fallback close button over the body's top-right
   *  corner (the title is sr-only, so there is no DialogHeader row), which
   *  would otherwise overlap the title. */
  titleRowClassName?: string;
  /** Known readiness from the organization status page or an action-only entry point. */
  readiness?: ProjectMigrationReadiness;
  /** Keys already on the new API are the only rows left in the lookback. */
  remainingActionsAreMigrated?: boolean;
}) {
  const actionNeeded = readiness === "action-needed";
  const showActionPrompt = actionNeeded && !remainingActionsAreMigrated;
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
          <V4MigrationExternalLink
            href={FULL_TEXT_SEARCH_URL}
            analytics={{ section: "header", link: "full_text_search_docs" }}
          >
            full-text search
          </V4MigrationExternalLink>
          , a{" "}
          <V4MigrationExternalLink
            href={FILTER_SEARCH_BAR_URL}
            analytics={{ section: "header", link: "filter_search_bar_docs" }}
          >
            new filter search bar
          </V4MigrationExternalLink>
          ,{" "}
          <V4MigrationExternalLink
            href={ALERTS_URL}
            analytics={{ section: "header", link: "alerts_docs" }}
          >
            alerts
          </V4MigrationExternalLink>
          ,{" "}
          <V4MigrationExternalLink
            href={CODE_EVALUATORS_URL}
            analytics={{ section: "header", link: "code_evaluators_docs" }}
          >
            code evaluators
          </V4MigrationExternalLink>
          , and the{" "}
          <V4MigrationExternalLink
            href={LANGFUSE_ASSISTANT_URL}
            analytics={{ section: "header", link: "langfuse_assistant_docs" }}
          >
            Langfuse Halo
          </V4MigrationExternalLink>
          .
          {showActionPrompt
            ? " Complete the action items below to avoid disruption."
            : ""}{" "}
          <V4MigrationDocsLink />
        </p>
        {remainingActionsAreMigrated ? (
          <Banner variant="success">
            Migration complete. This banner disappears after{" "}
            {V4_MIGRATION_LOOKBACK_DAYS} days without legacy traffic.
          </Banner>
        ) : null}
        {showActionPrompt && <V4MigrationDeadlineNote />}
      </div>
    </>
  );
}

// The primary agent CTA as its own group. The prompt is always visible so a
// single click on the CTA (or the code block's corner button) copies it.
// Project API keys are NOT created as a side effect: credentials only exist
// after an explicit click on the separate "Create keys for project access"
// action, and secrets never enter the agent prompt.
/** @internal */
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
        name: "v4-migration-key",
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
          classifyTrpcToastError(error, "project_api_key.create"),
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
          <Copy size="base" __rawClassName="mr-1.5" />
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
                  <HoverCard
                    openDelay={200}
                    content={
                      <div className="w-80 p-3 text-sm">
                        Only users with admin access can create project API
                        keys. Please contact your admins.
                      </div>
                    }
                  >
                    {({ getTriggerProps }) => (
                      <span
                        className="shrink-0"
                        tabIndex={0}
                        {...getTriggerProps()}
                      >
                        {createKeysButton}
                      </span>
                    )}
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
      delayedOtelCount: otelSection.pendingCount,
      customInstrumentationCount: customSection.actionableCount,
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
          <V4MigrationChecklist
            migrationData={migrationData}
            evidenceProjectId={evidenceProjectId}
            assistant={
              isInAppAgentLauncherVisible
                ? { onMigrate: handleMigrateEvalsWithAgent, aiFeaturesEnabled }
                : null
            }
            evalsUrl={evalsUrl}
            integrationsUrl={integrationsUrl}
            onNavigate={onNavigate}
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
                <HoverCard
                  openDelay={200}
                  content={
                    <div className="w-80 p-3 text-sm">
                      The latest SDK no longer sets trace input and output;{" "}
                      <V4MigrationExternalLink
                        href={OBSERVATIONS_DATA_MODEL_URL}
                        analytics={{
                          section: "compare_row",
                          link: "observations_data_model_docs",
                        }}
                      >
                        v4 infers them from observations
                      </V4MigrationExternalLink>
                      .
                    </div>
                  }
                >
                  {({ getTriggerProps }) => (
                    <button
                      type="button"
                      aria-label="Why compare traces?"
                      className="shrink-0"
                      {...getTriggerProps()}
                    >
                      <Info size="base" />
                    </button>
                  )}
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
