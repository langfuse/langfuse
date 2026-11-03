import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { env } from "@/src/env.mjs";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useAccountV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import {
  isV4MigrationTopBannerVisible,
  type V4MigrationTopBannerSeverity,
} from "@/src/features/v4-migration/topBannerContent";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import type { V4MigrationTopBannerViewProps } from "@/src/features/v4-migration/V4MigrationTopBannerView";
import { api } from "@/src/utils/api";

/**
 * Org-wide legacy v3 banner for Langfuse Cloud. Returns null when it is
 * hidden. Copy and color come from env; the strip stays up while the org
 * still has legacy usage. There is no dismiss.
 */
export function useV4MigrationTopBanner(): V4MigrationTopBannerViewProps | null {
  const session = useSession();
  const capture = usePostHogClientCapture();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { organization, project } = useQueryProjectOrOrganization();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);

  // The demo org is not the viewer's to migrate.
  const orgId =
    organization && organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID
      ? organization.id
      : null;
  const enabled = Boolean(orgId) && isLangfuseCloud && v4UpgradeUiEnabled;

  const stateQuery = api.v4Transition.legacyApiBannerState.useQuery(
    { orgId: orgId ?? "" },
    {
      enabled,
      throwOnError: false,
      meta: { silentHttpCodes: [401, 403, 404] },
    },
  );
  const state = stateQuery.data;
  const sessionOrg = session.data?.user?.organizations.find(
    (org) => org.id === orgId,
  );
  const orgProjects = (sessionOrg?.projects ?? [])
    .filter((orgProject) => !orgProject.deletedAt)
    .map((orgProject) => ({ id: orgProject.id, name: orgProject.name }));
  const statusByProjectId = useAccountV4MigrationData({
    organizations: sessionOrg
      ? [{ id: sessionOrg.id, name: sessionOrg.name, projects: orgProjects }]
      : [],
    enabled:
      enabled &&
      orgProjects.length > 0 &&
      state !== undefined &&
      state.severity !== "off",
  });

  const actionNeededCount = orgProjects.filter((orgProject) => {
    const status = statusByProjectId.get(orgProject.id);
    return status && getProjectMigrationReadiness(status) === "action-needed";
  }).length;
  const isChecking = orgProjects.some((orgProject) => {
    const status = statusByProjectId.get(orgProject.id);
    return !status || getProjectMigrationReadiness(status) === "checking";
  });
  const severity = state?.severity;
  const visible = isV4MigrationTopBannerVisible({
    severity: enabled ? severity : undefined,
    message: enabled ? state?.message : undefined,
    v4UpgradeUiEnabled,
    isLangfuseCloud,
    actionNeededCount,
    isChecking,
  });
  const bannerSeverity: V4MigrationTopBannerSeverity | null =
    visible && (severity === "warning" || severity === "critical")
      ? severity
      : null;
  // Exposure denominator for the CTA funnel; PostHog is the external system.
  // Fires once per severity the viewer sees, not on every refetch.
  const shownSeverityRef = useRef<V4MigrationTopBannerSeverity | null>(null);
  useEffect(() => {
    if (!bannerSeverity || shownSeverityRef.current === bannerSeverity) return;
    shownSeverityRef.current = bannerSeverity;
    capture("v4_migration:top_banner_shown", {
      severity: bannerSeverity,
      actionNeededCount,
    });
  }, [bannerSeverity, actionNeededCount, capture]);

  if (!bannerSeverity || !state?.message) return null;

  const analytics = {
    severity: bannerSeverity,
    actionNeededCount,
  };

  return {
    severity: bannerSeverity,
    message: state.message,
    onStatusClick: () => {
      capture("v4_migration:top_banner_cta_clicked", {
        ...analytics,
        cta: "primary",
      });
    },
  };
}
