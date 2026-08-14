import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/src/components/ui/dialog";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import {
  getHasV4Traffic,
  getProjectMigrationReadiness,
} from "@/src/features/v4-migration/migrationData";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";

const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const dismissKey = (projectId: string) =>
  `v4-migration-migrated-dialog-dismissed:${projectId}`;
const ackKey = (projectId: string) =>
  `v4-migration-migrated-dialog-acked:${projectId}`;

// Only evaluated once the readiness queries have resolved, i.e. strictly
// after hydration — safe to read browser storage without an SSR mismatch.
// "Got it" acknowledges permanently; X only snoozes for 14 days.
const isAckedOrSnoozed = (projectId: string) => {
  if (typeof window === "undefined") return true;
  if (window.localStorage.getItem(ackKey(projectId))) return true;
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
 * Welcome dialog shown once per user when a project has finished the v4
 * migration. Appearing IS the switch: it turns the v4 UI on in the background
 * and tells the user so; "Got it" only acknowledges. Keys off current state,
 * not the migration moment: completion is per-project but acknowledgement is
 * per-user, so teammates of whoever migrated (and users who migrated before
 * this shipped) get the moment too. Requires actual v4 traffic: a project
 * that is "ready" only because it sent no data gets nothing.
 */
export function V4MigrationMigratedDialog() {
  const router = useRouter();
  const { project } = useQueryProject();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);
  const capture = usePostHogClientCapture();
  const { isBetaEnabled, canToggleV4, setBetaEnabled } = useV4Beta();
  const migrationData = useProjectV4MigrationData({
    projectId: project?.id,
    enabled: v4UpgradeUiEnabled && Boolean(project),
  });
  // Bumped on dismiss so the localStorage read below re-evaluates.
  const [, setDismissCount] = useState(0);

  const readiness = getProjectMigrationReadiness(migrationData);
  const hasV4Traffic = getHasV4Traffic(migrationData);
  const projectId = project?.id;
  // Deliberately independent of the user's current view: the dialog stays
  // until acknowledged, also for users whose UI it already switched.
  const isVisible =
    Boolean(projectId) &&
    v4UpgradeUiEnabled &&
    canToggleV4 &&
    readiness === "ready" &&
    hasV4Traffic &&
    !isAckedOrSnoozed(projectId!);

  // PostHog and the session are the external systems: report one shown event
  // per project per mount (surviving refetch-driven re-renders) and switch
  // the v4 UI on in the background — appearing IS the switch; the copy states
  // it and "Got it" only acknowledges.
  const shownProjectsRef = useRef(new Set<string>());
  useEffect(() => {
    if (!isVisible || !projectId) return;
    if (shownProjectsRef.current.has(projectId)) return;
    shownProjectsRef.current.add(projectId);
    capture("v4_migration:migrated_banner_shown", {
      projectId,
      surface: "dialog",
      autoSwitchedV4: !isBetaEnabled,
    });
    if (!isBetaEnabled) setBetaEnabled(true);
  }, [isVisible, projectId, isBetaEnabled, setBetaEnabled, capture]);

  if (!isVisible || !projectId) return null;

  const snooze = () => {
    capture("v4_migration:migrated_banner_dismissed", {
      projectId,
      surface: "dialog",
    });
    window.localStorage.setItem(dismissKey(projectId), String(Date.now()));
    setDismissCount((count) => count + 1);
  };
  const acknowledge = () => {
    window.localStorage.setItem(ackKey(projectId), String(Date.now()));
    setDismissCount((count) => count + 1);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && snooze()}>
      {/* Accidental click-away must not count as a dismissal: closing is
          only the explicit X or ESC (14-day snooze) or Got it (permanent).
          The close button overlaps the hero image, so it gets a frosted chip
          to stay legible. */}
      <DialogContent
        aria-label="Welcome to Langfuse V4"
        closeOnInteractionOutside={false}
        className="[&>div:last-child]:bg-background/80 [&>div:last-child]:flex [&>div:last-child]:size-7 [&>div:last-child]:items-center [&>div:last-child]:justify-center [&>div:last-child]:rounded-full [&>div:last-child]:shadow-sm [&>div:last-child]:backdrop-blur-sm [&>div:last-child>button]:flex [&>div:last-child>button]:items-center [&>div:last-child>button]:justify-center"
      >
        <DialogBody>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/v4-beta-intro.jpg"
            alt="Langfuse gets faster: performance comparison showing 5x to 165x speedups"
            className="w-full rounded-md"
          />
          <div className="flex flex-col gap-2">
            <p className="text-foreground text-lg font-bold">
              Welcome to Langfuse V4
            </p>
            <p className="text-muted-foreground text-sm">
              Your migration is completed and this project is fully v4
              compatible. The v4 UI is now turned on.
            </p>
          </div>
        </DialogBody>
        <DialogFooter variant="action">
          <Button
            variant="secondary"
            onClick={() => {
              capture("v4_migration:migrated_banner_status_clicked", {
                projectId,
                surface: "dialog",
              });
              snooze();
              router.push("/v4-migration");
            }}
          >
            View migration status
          </Button>
          <Button
            onClick={() => {
              // FYI only: acknowledging does not switch the v4 view on.
              capture("v4_migration:migrated_banner_switch_clicked", {
                projectId,
                surface: "dialog",
                isAcknowledgementOnly: true,
              });
              acknowledge();
            }}
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
