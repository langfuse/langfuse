import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { SidebarMenuButton, useSidebar } from "@/src/components/ui/sidebar";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { useOpenV4MigrationPanel } from "@/src/features/v4-migration/hooks/useOpenV4MigrationPanel";
import { api } from "@/src/utils/api";

export function V4MigrationNavItem() {
  const { project, organization } = useQueryProject();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);
  const openMigrationPanel = useOpenV4MigrationPanel();
  const { isMobile, setOpenMobile: setOpenMobileSidebar } = useSidebar();
  const capture = usePostHogClientCapture();
  const migrationData = useProjectV4MigrationData({
    projectId: project?.id,
    enabled: v4UpgradeUiEnabled && Boolean(project),
  });

  const readiness = getProjectMigrationReadiness({
    sdk: migrationData.sdk,
    evals: migrationData.evals,
    experiments: migrationData.experiments,
    apis: migrationData.apis,
    exports: migrationData.exports,
    forceV3Experience: migrationData.forceV3Experience,
  });

  // PostHog is the external system: the migration checks resolve
  // asynchronously after the sidebar mounts, and this component runs on every
  // app load — unlike panel_checks_loaded it also fires for projects that are
  // already migrated (the pill renders nothing then), which is what makes
  // "readiness flipped to ready" observable at all. The settled guard mirrors
  // panel_checks_loaded: readiness alone would lock in "unavailable" while a
  // sibling check is still loading. The ref dedupes per project AND settled
  // state: identical refetch-driven re-settles stay silent, but a state
  // change in a long-lived tab re-reports so outcomes are not delayed until
  // the next full mount.
  const projectId = project?.id;
  const organizationId = organization?.id;
  const sdkStatus = migrationData.sdk.status;
  const hasV4Traffic = migrationData.sdk.sdkUsageSeries.some(
    (series) => series.v4MigrationStatus === "compatible",
  );
  const checksSettled =
    sdkStatus !== "checking" &&
    migrationData.experiments.status !== "loading" &&
    migrationData.evals.status !== "loading" &&
    migrationData.apis.status !== "loading" &&
    migrationData.exports.status !== "loading";
  const { mutate: recordProjectState } =
    api.v4Transition.recordProjectState.useMutation();
  const stateCheckedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!projectId || !v4UpgradeUiEnabled || !checksSettled) return;
    const stateKey = `${projectId}:${readiness}:${sdkStatus}:${hasV4Traffic}`;
    if (stateCheckedRef.current.has(stateKey)) return;
    stateCheckedRef.current.add(stateKey);
    // Tenant ids only (same shape as backend:activity) — never user content.
    capture("v4_migration:project_state_checked", {
      readiness,
      sdkStatus,
      projectId,
      organizationId: organizationId ?? null,
    });
    // Report the settled state so the server records set-once migration
    // outcomes ("unavailable" means a check errored — nothing to record).
    if (
      (readiness === "ready" ||
        readiness === "action-needed" ||
        readiness === "partner-managed") &&
      sdkStatus !== "error"
    ) {
      recordProjectState({ projectId, readiness, sdkStatus, hasV4Traffic });
    }
  }, [
    projectId,
    organizationId,
    v4UpgradeUiEnabled,
    checksSettled,
    readiness,
    sdkStatus,
    hasV4Traffic,
    capture,
    recordProjectState,
  ]);

  if (!v4UpgradeUiEnabled || !project) {
    return null;
  }
  if (readiness !== "action-needed") {
    return null;
  }
  const label = "Action required";

  const handleClick = () => {
    capture("sidebar:v4_migration_card_clicked");
    if (isMobile) {
      setOpenMobileSidebar(false);
    }
    setTimeout(() => {
      // push to next tick to avoid flickering when hiding sidebar on mobile
      openMigrationPanel(
        { id: project.id, name: project.name },
        "sidebar_card",
      );
    }, 1);
  };

  return (
    <div className="px-2 py-2 group-data-[collapsible=icon]:hidden">
      <SidebarMenuButton
        onClick={handleClick}
        tooltip={label}
        className="border-input w-full gap-1.5 rounded-full border pr-2 pl-[9px]"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400 dark:bg-orange-400" />
        <span className="truncate font-bold" title={label}>
          {label}
        </span>
        <ChevronRight className="text-muted-foreground ml-auto h-4 w-4 shrink-0" />
      </SidebarMenuButton>
    </div>
  );
}
