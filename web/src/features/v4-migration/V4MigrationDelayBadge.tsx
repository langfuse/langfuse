/* eslint-disable @repo/no-null-render */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  useV4UpgradeUiEnabled,
  useV4UpgradeUiFlag,
} from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useForceV3Experience } from "@/src/features/v4-migration/useForceV3Experience";
import { PARTNER_INTEGRATION_FAQ_URL } from "@/src/features/v4-migration/partnerIntegrationDocs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useOpenV4MigrationPanel } from "@/src/features/v4-migration/hooks/useOpenV4MigrationPanel";
import {
  useProjectV4EvalData,
  useProjectV4SdkData,
} from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { useEvalUpgradeAssistantPlan } from "@/src/features/v4-migration/useV4UpgradeAssistantSupport";
import { V4MigrationBadgeContent } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import {
  getCustomInstrumentationSectionState,
  getOtelSectionState,
} from "@/src/features/v4-migration/sdkVersionStatus";
import { EvaluatorMigrationDialog } from "@/src/features/v4-migration/EvaluatorMigrationDialog";
import { buildDeprecatedRulesUrl } from "@/src/features/v4-migration/evaluatorMigrationUrls";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";

// The pill's description finishes expanding after 300ms (V4MigrationBadgeContent),
// so a 500ms dwell means the full text was on screen — a drive-by mouse pass
// does not count as "noticed".
const HOVER_DWELL_MS = 500;

export function V4MigrationDelayBadge({
  page,
}: {
  // Which table hosts the badge — clicks/hovers/impressions segment by it.
  page: "traces" | "observations" | "experiments";
}) {
  const v4UpgradeUiFlagEnabled = useV4UpgradeUiFlag();
  const openMigrationPanel = useOpenV4MigrationPanel();
  const { project } = useQueryProject();
  const forceV3 = useForceV3Experience(project?.id);
  const { isV4 } = useReadPath();
  const capture = usePostHogClientCapture();

  // Forced-v3 projects still see the data-delay badge, but it points at the
  // partner FAQ instead of the migration panel
  const enabled = v4UpgradeUiFlagEnabled && (!forceV3 || isV4);
  const sdk = useProjectV4SdkData({
    projectId: project?.id,
    enabled: enabled && Boolean(project),
  });

  // Every delayed ingestion path shows the pill, matching the migration
  // panel's per-path offender detectors (LFE-14861) — not just outdated SDKs.
  // Unlike the panel's Update SDK section, the pill states a factual delay,
  // so the SDK path needs a confirmed-outdated series: an unparsable version
  // is grounds for review, not proof the data is delayed.
  const isTransient = sdk.status === "checking" || sdk.status === "error";
  const sdkActionable = !isTransient && sdk.upgradeRequiredCount > 0;
  const otelActionable =
    !isTransient && getOtelSectionState(sdk).delayedCount > 0;
  const customActionable =
    !isTransient && getCustomInstrumentationSectionState(sdk).series.length > 0;
  const actionablePaths = [
    sdkActionable,
    otelActionable,
    customActionable,
  ].filter(Boolean).length;

  const visible = enabled && Boolean(project) && actionablePaths > 0;
  const projectId = project?.id;

  // Impression + hover exist to answer one question: do users notice the
  // badge? `shown` is the exposure denominator, `hovered` the
  // noticed-but-not-clicked middle. Both fire at most once per exposure,
  // where an exposure ends when the hosting project changes: the project
  // switcher navigates within the same route, so the component survives the
  // switch, and a plain once-per-mount boolean would swallow the next
  // project's exposure (clicks with no matching shown). The effect
  // synchronizes visibility with PostHog (it can flip to true only after the
  // SDK check resolves).
  const shownCapturedForRef = useRef<string | null>(null);
  const hoverCapturedForRef = useRef<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (visible && projectId && shownCapturedForRef.current !== projectId) {
      shownCapturedForRef.current = projectId;
      // A new exposure re-arms the pair together: drop any dwell still
      // pending from the previous project (the switch can happen without a
      // mouseleave) and clear the hover marker, so a project the user
      // returns to in place gets a `hovered` chance for each `shown` it
      // fires — otherwise numerator and denominator drift apart.
      hoverCapturedForRef.current = null;
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      capture("v4_migration:delay_badge_shown", { page });
    }
  }, [visible, projectId, page, capture]);
  // A pending dwell timer must not outlive the badge: React removes the
  // button without a mouseleave when `visible` flips false (SDK check turns
  // transient, project switch), so clear on visibility changes, not only on
  // unmount.
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, [visible]);

  if (!visible || !project) {
    return null;
  }

  const handleHoverStart = () => {
    if (hoverCapturedForRef.current === project.id || hoverTimerRef.current) {
      return;
    }
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      hoverCapturedForRef.current = project.id;
      capture("v4_migration:delay_badge_hovered", { page });
    }, HOVER_DWELL_MS);
  };

  const handleHoverEnd = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const handleClick = () => {
    // A click consumes this exposure's `hovered` budget: the event counts
    // noticed but NOT clicked, so cancel the pending dwell (touch taps
    // synthesize a mouseenter with no mouseleave, so an uncancelled timer
    // would count every tap as a hover) and mark the project as spent — a
    // re-hover after the click must not file the user under "never clicked".
    handleHoverEnd();
    hoverCapturedForRef.current = project.id;
    if (forceV3) {
      capture("v4_migration:delay_badge_clicked", { action: "docs", page });
      window.open(PARTNER_INTEGRATION_FAQ_URL, "_blank", "noopener,noreferrer");
      return;
    }
    capture("v4_migration:delay_badge_clicked", { page });
    openMigrationPanel({ id: project.id, name: project.name }, "delay_badge");
  };

  // The hover's action clause echoes the panel section the click opens;
  // multiple delayed paths get the generic clause.
  const description =
    actionablePaths > 1
      ? "Upgrade to v4 for real-time data"
      : sdkActionable
        ? "Update your SDK for real-time data"
        : otelActionable
          ? "Update your OTel instrumentation for real-time data"
          : "Upgrade your instrumentation for real-time data";

  return (
    <V4MigrationBadgeContent
      onClick={handleClick}
      onHoverStart={handleHoverStart}
      onHoverEnd={handleHoverEnd}
      title="New data in ~15 min"
      description={forceV3 ? "Learn more in the docs" : description}
    />
  );
}

/** Shared gating for the eval "Action required" badges: v4 upgrade UI flag,
 * project context, and a loaded, non-zero deprecated-eval count. */
function useEvalUpdateRequiredBadgeState() {
  const { project } = useQueryProject();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);
  const enabled = v4UpgradeUiEnabled && Boolean(project);
  const evalState = useProjectV4EvalData({
    projectId: project?.id,
    enabled,
  });

  const visible =
    v4UpgradeUiEnabled &&
    Boolean(project) &&
    evalState.status === "loaded" &&
    evalState.count > 0;

  return { project, enabled, visible };
}

/** Opens the evaluator migration choices from the v4 migration badge. */
export function V4MigrationUpdateRequiredBadge() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const { project, visible, enabled } = useEvalUpdateRequiredBadgeState();
  const upgradePlan = useEvalUpgradeAssistantPlan({
    projectId: project?.id,
    enabled,
  });

  if (!visible || !project) {
    return null;
  }

  const handleClick = () => {
    capture("v4_migration:update_required_badge_clicked");
    setDialogOpen(true);
  };

  const handleManualUpgrade = () => {
    if (!project) return;
    setDialogOpen(false);
    router.push(buildDeprecatedRulesUrl(project.id));
  };

  return (
    <>
      <V4MigrationBadgeContent
        onClick={handleClick}
        title="Action required"
        description="Choose how to upgrade"
      />
      <EvaluatorMigrationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        scope={{ type: "all" }}
        assistantPrompt={upgradePlan.assistantPrompt}
        onManualUpgrade={handleManualUpgrade}
        onAssistantStarted={() => undefined}
      />
    </>
  );
}
