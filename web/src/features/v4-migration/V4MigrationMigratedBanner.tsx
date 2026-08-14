import { useEffect, useRef, useState } from "react";
import { PartyPopper, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Layer } from "@/src/components/ui/layer";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";

const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const dismissKey = (projectId: string) =>
  `v4-migration-migrated-banner-dismissed:${projectId}`;

// Only evaluated once the readiness queries have resolved, i.e. strictly
// after hydration — safe to read browser storage without an SSR mismatch.
const isRecentlyDismissed = (projectId: string) => {
  if (typeof window === "undefined") return true;
  const dismissedAt = Number(
    window.localStorage.getItem(dismissKey(projectId)),
  );
  return (
    Number.isFinite(dismissedAt) &&
    dismissedAt > 0 &&
    Date.now() - dismissedAt < DISMISS_TTL_MS
  );
};

/**
 * Top-of-page notification for users whose project finished the v4 migration
 * while their own view is still on v3. Migration completion is per-project but
 * the v4 view is per-user, so this must key off current state, not the
 * migration moment: teammates of whoever migrated — and users who migrated
 * before this shipped — see it too, until they switch or dismiss (per-user,
 * 14-day TTL). Celebratory copy requires actual v4 traffic: a project that is
 * "ready" only because it sent no data gets no banner. The support path exists
 * for users who don't trust the verdict enough to click switch.
 */
export function V4MigrationMigratedBanner() {
  const { project } = useQueryProject();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);
  const capture = usePostHogClientCapture();
  const { openWithMode: openSupportDrawerWithMode } = useSupportDrawer();
  const { isBetaEnabled, canToggleV4, setBetaEnabled, isLoading } = useV4Beta();
  const migrationData = useProjectV4MigrationData({
    projectId: project?.id,
    enabled: v4UpgradeUiEnabled && Boolean(project),
  });
  // Bumped on dismiss so the localStorage read below re-evaluates.
  const [, setDismissCount] = useState(0);

  const readiness = getProjectMigrationReadiness(migrationData);
  const hasV4Traffic = migrationData.sdk.sdkUsageSeries.some(
    (series) => series.v4MigrationStatus === "compatible",
  );
  const projectId = project?.id;
  const isVisible =
    Boolean(projectId) &&
    v4UpgradeUiEnabled &&
    canToggleV4 &&
    !isBetaEnabled &&
    readiness === "ready" &&
    hasV4Traffic &&
    !isRecentlyDismissed(projectId!);

  // PostHog is the external system: report one shown event per project per
  // mount, surviving refetch-driven re-renders.
  const shownProjectsRef = useRef(new Set<string>());
  useEffect(() => {
    if (!isVisible || !projectId) return;
    if (shownProjectsRef.current.has(projectId)) return;
    shownProjectsRef.current.add(projectId);
    capture("v4_migration:migrated_banner_shown", { projectId });
  }, [isVisible, projectId, capture]);

  if (!isVisible || !projectId) return null;

  return (
    <Layer name="toast">
      <div
        role="status"
        aria-live="polite"
        className="top-banner-offset border-border/60 bg-background/80 animate-in fade-in-0 slide-in-from-top-4 zoom-in-95 fill-mode-both fixed left-1/2 mt-4 flex -translate-x-1/2 items-center gap-3 rounded-full border py-1.5 pr-1.5 pl-4 shadow-xl ring-1 ring-black/5 backdrop-blur-xl duration-500 ease-out dark:ring-white/10"
      >
        <PartyPopper className="text-primary h-4 w-4 shrink-0" />
        <span className="text-foreground text-sm whitespace-nowrap">
          Migration complete — this project is v4 compatible
        </span>
        <Button
          size="sm"
          className="rounded-full"
          disabled={isLoading}
          onClick={() => {
            capture("v4_migration:migrated_banner_switch_clicked", {
              projectId,
            });
            // The banner hides itself once the session reports v4 enabled.
            setBetaEnabled(true);
          }}
        >
          Switch to v4
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground rounded-full"
          onClick={() => {
            capture("v4_migration:migrated_banner_support_clicked", {
              projectId,
            });
            openSupportDrawerWithMode("form", { topic: "V4 Migration" });
          }}
        >
          Report an issue
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground rounded-full"
          onClick={() => {
            capture("v4_migration:migrated_banner_dismissed", { projectId });
            window.localStorage.setItem(
              dismissKey(projectId),
              String(Date.now()),
            );
            setDismissCount((count) => count + 1);
          }}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Layer>
  );
}
