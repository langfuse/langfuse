import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import useSessionStorage from "@/src/components/useSessionStorage";
import { env } from "@/src/env.mjs";
import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useQueryProjectOrOrganization } from "@/src/features/projects";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { useAccountV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { useOpenV4MigrationPanel } from "@/src/features/v4-migration/hooks/useOpenV4MigrationPanel";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import {
  getV4MigrationTopBannerContent,
  getV4MigrationTopBannerPhase,
  type V4MigrationTopBannerPhase,
} from "@/src/features/v4-migration/topBannerContent";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import type { V4MigrationTopBannerViewProps } from "@/src/features/v4-migration/V4MigrationTopBannerView";
import { api } from "@/src/utils/api";

const CLOSED_SESSION_KEY = "v4-migration-top-banner:closed";
// The phase flips at schedule boundaries; poll the cheap server clock query.
const STATE_REFETCH_INTERVAL_MS = 60 * 1000;

/**
 * Org-wide legacy API shutdown banner for Langfuse Cloud. Returns null when it
 * is hidden. It reappears on every visit: only the amber phase can be closed,
 * and only for the browser session.
 */
export function useV4MigrationTopBanner(): V4MigrationTopBannerViewProps | null {
  const router = useRouter();
  const session = useSession();
  const capture = usePostHogClientCapture();
  const openPanel = useOpenV4MigrationPanel();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { organization, project } = useQueryProjectOrOrganization();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);
  const canManageIntegrations = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:update",
  });
  const [closed, setClosed] = useSessionStorage(CLOSED_SESSION_KEY, false);

  // The demo org is not the viewer's to migrate.
  const orgId =
    organization && organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID
      ? organization.id
      : null;
  const enabled = Boolean(orgId) && isLangfuseCloud && v4UpgradeUiEnabled;
  const nowOverride =
    typeof router.query.v4BannerNow === "string"
      ? router.query.v4BannerNow
      : undefined;

  const stateQuery = api.v4Transition.legacyApiBannerState.useQuery(
    { orgId: orgId ?? "", nowOverride },
    {
      enabled,
      refetchInterval: STATE_REFETCH_INTERVAL_MS,
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
      state.phase !== "hidden",
  });

  const actionNeededProjects = orgProjects.filter((orgProject) => {
    const status = statusByProjectId.get(orgProject.id);
    return status && getProjectMigrationReadiness(status) === "action-needed";
  });
  const actionNeededCount = actionNeededProjects.length;
  const isChecking = orgProjects.some((orgProject) => {
    const status = statusByProjectId.get(orgProject.id);
    return !status || getProjectMigrationReadiness(status) === "checking";
  });
  const phase = getV4MigrationTopBannerPhase({
    serverPhase: enabled ? state?.phase : undefined,
    v4UpgradeUiEnabled,
    isLangfuseCloud,
    actionNeededCount,
    isChecking,
  });
  const visiblePhase = phase === "amber" && closed ? null : phase;
  const role = canManageIntegrations ? "admin" : "member";

  // Exposure denominator for the CTA funnel; PostHog is the external system.
  // Fires once per phase the viewer sees, not on every refetch.
  const shownPhaseRef = useRef<V4MigrationTopBannerPhase | null>(null);
  useEffect(() => {
    if (!visiblePhase || shownPhaseRef.current === visiblePhase) return;
    shownPhaseRef.current = visiblePhase;
    capture("v4_migration:top_banner_shown", {
      phase: visiblePhase,
      role,
      actionNeededCount,
    });
  }, [visiblePhase, role, actionNeededCount, capture]);

  if (!visiblePhase || !state) return null;

  const content = getV4MigrationTopBannerContent({
    phase: visiblePhase,
    state,
    actionNeededCount,
    totalProjects: orgProjects.length,
    canManageIntegrations,
  });
  const analytics = { phase: visiblePhase, role, actionNeededCount };
  const firstActionNeededProject = actionNeededProjects[0];

  return {
    phase: visiblePhase,
    content: {
      ...content,
      primaryCtaLabel: firstActionNeededProject
        ? content.primaryCtaLabel
        : null,
    },
    onPrimaryClick: () => {
      if (!firstActionNeededProject) return;
      capture("v4_migration:top_banner_cta_clicked", {
        ...analytics,
        cta: "primary",
      });
      openPanel(
        {
          id: firstActionNeededProject.id,
          name: firstActionNeededProject.name,
          readiness: "action-needed",
        },
        "top_banner",
      );
    },
    onSecondaryClick: () =>
      capture("v4_migration:top_banner_cta_clicked", {
        ...analytics,
        cta: "docs",
      }),
    onClose: content.closable
      ? () => {
          capture("v4_migration:top_banner_closed", analytics);
          setClosed(true);
        }
      : undefined,
  };
}
