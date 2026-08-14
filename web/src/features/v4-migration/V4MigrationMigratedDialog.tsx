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
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
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
 * FYI dialog for users whose project finished the v4 migration while their own
 * view is still on v3: the project is compatible, but nothing is switched on
 * for them. Keys off current state, not the migration moment: completion is
 * per-project but acknowledgement is per-user, so teammates of whoever
 * migrated (and users who migrated before this shipped) get the moment too.
 * Requires actual v4 traffic: a project that is "ready" only because it sent
 * no data gets nothing. The support link is the out for users who distrust
 * the verdict.
 */
export function V4MigrationMigratedDialog() {
  const router = useRouter();
  const { project } = useQueryProject();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);
  const capture = usePostHogClientCapture();
  const { openWithMode: openSupportDrawerWithMode } = useSupportDrawer();
  const { isBetaEnabled, canToggleV4 } = useV4Beta();
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
    !isAckedOrSnoozed(projectId!);

  // PostHog is the external system: report one shown event per project per
  // mount, surviving refetch-driven re-renders.
  const shownProjectsRef = useRef(new Set<string>());
  useEffect(() => {
    if (!isVisible || !projectId) return;
    if (shownProjectsRef.current.has(projectId)) return;
    shownProjectsRef.current.add(projectId);
    capture("v4_migration:migrated_banner_shown", {
      projectId,
      surface: "dialog",
    });
  }, [isVisible, projectId, capture]);

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
          only the explicit X or ESC (14-day snooze) or Got it (permanent). */}
      <DialogContent
        aria-label="Welcome to Langfuse V4"
        closeOnInteractionOutside={false}
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
              Your migration is completed. This project is fully v4 compatible.{" "}
              <button
                type="button"
                className="text-primary font-bold hover:underline"
                onClick={() => {
                  capture("v4_migration:migrated_banner_support_clicked", {
                    projectId,
                    surface: "dialog",
                  });
                  openSupportDrawerWithMode("form", { topic: "V4 Migration" });
                }}
              >
                Something looks wrong?
              </button>
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
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
