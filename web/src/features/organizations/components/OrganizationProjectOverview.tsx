/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  LockIcon,
  Settings,
  Users,
  PlusIcon,
  Waypoints,
} from "@langfuse/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { StringParam, useQueryParams } from "use-query-params";
import {
  hasOrganizationAccess,
  useHasOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import { env } from "@/src/env.mjs";
import { type ReactNode } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";
import ContainerPage from "@/src/components/layouts/ContainerPage";
import { type Session } from "next-auth";
import { AgentToolsBanner } from "@/src/features/developer-tools/components/AgentToolsBanner";
import { V4MigrationProjectChip } from "@/src/features/v4-migration/V4MigrationProjectChip";
import { api } from "@/src/utils/api";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useAccountV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { ErrorPage } from "@/src/components/error-page";
import { GatewayLaunchBanner } from "@/src/features/ai-gateway/components/GatewayLaunch/GatewayLaunchBanner";
import { useGatewayLaunchTarget } from "@/src/features/ai-gateway/hooks/useGatewayLaunchEligibility";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { gatewayOnlyLanding } from "@/src/features/organizations/utils/gatewayOnlyLanding";
import { OrganizationSettingsTile } from "@/src/features/organizations/components/OrganizationSettingsTile/OrganizationSettingsTile";
import { useGatewayMemberStatus } from "@/src/features/organizations/hooks/useGatewayMemberStatus";
import { DemoOrganizationTile } from "@/src/features/organizations/components/DemoOrganizationTile";

const lastTraceLabel = (lastTraceAt: Date | string | null | undefined) =>
  lastTraceAt
    ? `Last trace ${formatCompactRelativeTime(new Date(lastTraceAt))}`
    : "No traces in the last 30d";

/** Marks the project that receives the org's AI Gateway traces. */
const GatewayProjectMark = () => (
  <span className="flex shrink-0" title="Receives AI Gateway traces">
    <Waypoints size="base" color="default" aria-label="AI Gateway project" />
  </span>
);

const OrganizationProjectTiles = ({
  org,
  search,
}: {
  org: NonNullable<Session["user"]>["organizations"][number];
  search?: string;
}) => {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const gatewayAccess = useGatewaySettingsAccess(org.id);
  // Gateway managers see which project receives the gateway's traces.
  const markGatewayProject =
    gatewayAccess.showManagement &&
    gatewayAccess.isIngestionConfigured === true;
  const gatewayConfigQuery = api.aiGateway.getConfig.useQuery(
    { orgId: org.id },
    { enabled: markGatewayProject },
  );
  const gatewayProjectId =
    gatewayConfigQuery.data?.config?.defaultIngestionProjectId;
  const lastTraceQuery = api.organizations.lastTraceByProject.useQuery(
    { orgId: org.id },
    { enabled: v4UpgradeUiEnabled },
  );
  const migrationStatusByProjectId = useAccountV4MigrationData({
    organizations: [
      {
        id: org.id,
        name: org.name,
        projects: org.projects
          .filter((project) => !project.deletedAt)
          .map((project) => ({ id: project.id, name: project.name })),
      },
    ],
    enabled: v4UpgradeUiEnabled,
  });
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {org.projects
        .filter(
          (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()),
        )
        .map((project) => {
          const migrationStatus = migrationStatusByProjectId.get(project.id);
          const migrationReadiness = migrationStatus
            ? getProjectMigrationReadiness(migrationStatus)
            : "checking";

          return v4UpgradeUiEnabled ? (
            <Card
              key={project.id}
              className="group hover:bg-muted/50 relative transition-colors"
            >
              {!project.deletedAt && (
                <Link
                  href={`/project/${project.id}`}
                  className="absolute inset-0"
                  aria-label={`Go to project ${project.name}`}
                />
              )}
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {markGatewayProject && project.id === gatewayProjectId && (
                      <GatewayProjectMark />
                    )}
                    <CardTitle
                      className="truncate text-base"
                      title={project.name}
                    >
                      {project.name}
                    </CardTitle>
                  </div>
                  {!project.deletedAt &&
                    (migrationReadiness === "action-needed" ||
                      migrationReadiness === "partner-managed") && (
                      <V4MigrationProjectChip
                        project={{ id: project.id, name: project.name }}
                        readiness={migrationReadiness}
                      />
                    )}
                </div>
              </CardHeader>
              {!project.deletedAt && (
                <CardContent className="min-h-7 pb-3">
                  <p className="text-muted-foreground text-xs">
                    {lastTraceQuery.isSuccess
                      ? lastTraceLabel(
                          lastTraceQuery.data?.find(
                            (t) => t.projectId === project.id,
                          )?.lastTraceAt,
                        )
                      : null}
                  </p>
                </CardContent>
              )}
              {project.deletedAt && (
                <CardContent>
                  <CardDescription>Project is being deleted</CardDescription>
                </CardContent>
              )}
            </Card>
          ) : (
            <Card key={project.id}>
              <CardHeader>
                <div className="flex min-w-0 items-center gap-2">
                  {markGatewayProject && project.id === gatewayProjectId && (
                    <GatewayProjectMark />
                  )}
                  <CardTitle
                    className="truncate text-base"
                    title={project.name}
                  >
                    {project.name}
                  </CardTitle>
                </div>
              </CardHeader>
              {!project.deletedAt ? (
                <CardFooter className="gap-2">
                  <Button asChild variant="secondary">
                    <Link href={`/project/${project.id}`}>Go to project</Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href={`/project/${project.id}/settings`}>
                      <Settings size="base" color="default" />
                    </Link>
                  </Button>
                </CardFooter>
              ) : (
                <CardContent>
                  <CardDescription>Project is being deleted</CardDescription>
                </CardContent>
              )}
            </Card>
          );
        })}
    </div>
  );
};

const OrganizationActionButtons = ({ orgId }: { orgId: string }) => {
  const session = useSession();
  const gatewayOnly = gatewayOnlyLanding(session.data, orgId) !== undefined;
  const membersViewAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:read",
  });
  const createProjectAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "projects:create",
  });

  return (
    <>
      {membersViewAccess && (
        <Button asChild variant="ghost">
          <Link href={`/organization/${orgId}/settings/members`}>
            <Users size="base" color="default" />
          </Link>
        </Button>
      )}
      {createProjectAccess && (
        <Button asChild>
          <Link href={createProjectRoute(orgId)}>
            <PlusIcon size="base" __rawClassName="mr-2" aria-hidden="true" />
            New project
          </Link>
        </Button>
      )}
      {!createProjectAccess && !gatewayOnly && (
        <Button disabled>
          <LockIcon size="base" __rawClassName="mr-2" aria-hidden="true" />
          New project
        </Button>
      )}
    </>
  );
};

const SingleOrganizationPage = ({
  org,
  search,
  banner,
}: {
  org: Organization;
  search?: string;
  banner: ReactNode;
}) => {
  const isDemoOrg =
    env.NEXT_PUBLIC_DEMO_ORG_ID === org.id &&
    org.projects.some((p) => p.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID);

  if (isDemoOrg) {
    return (
      <ContainerPage
        headerProps={{
          title: "Demo Organization",
        }}
      >
        <DemoOrganizationTile />
      </ContainerPage>
    );
  }

  return (
    <ContainerPage
      headerProps={{
        title: "Projects",
        actionButtonsRight: <OrganizationActionButtons orgId={org.id} />,
      }}
    >
      {banner}
      <OrganizationProjects org={org} search={search} />
    </ContainerPage>
  );
};

/** OrganizationProjects lists the org's projects, or points to its settings (gateway-only members: the gateway) when the user has none */
const OrganizationProjects = ({
  org,
  search,
}: {
  org: Organization;
  search?: string;
}) => {
  const session = useSession();
  const canCreateProject = useHasOrganizationAccess({
    organizationId: org.id,
    scope: "projects:create",
  });

  if (org.projects.length > 0) {
    return <OrganizationProjectTiles org={org} search={search} />;
  }
  if (gatewayOnlyLanding(session.data, org.id)?.canUseGateway === true) {
    return <ConnectedGatewayMemberTile org={org} />;
  }
  return (
    <OrganizationSettingsTile
      orgId={org.id}
      orgName={org.name}
      state={canCreateProject ? "noProjects" : "noProjectAccess"}
    />
  );
};

/** ConnectedGatewayMemberTile loads the member's gateway status into the tile */
const ConnectedGatewayMemberTile = ({ org }: { org: Organization }) => {
  const state = useGatewayMemberStatus(org.id);
  return (
    <OrganizationSettingsTile orgId={org.id} orgName={org.name} state={state} />
  );
};

export const OrganizationProjectOverview = () => {
  const router = useRouter();
  const queryOrgId = router.query.organizationId;
  const session = useSession();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const organizations = session.data?.user?.organizations;
  const [{ search }] = useQueryParams({ search: StringParam });
  const landing = gatewayOnlyLanding(session.data, queryOrgId);
  const org = organizations?.find((item) => item.id === queryOrgId);
  const gatewayLaunchCandidates =
    org &&
    org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID &&
    getContextualFeatureFlags(session.data?.user, {
      organizationId: org.id,
    })?.aiGateway === true &&
    hasOrganizationAccess({
      session: session.data,
      organizationId: org.id,
      scope: "gateway:invoke",
    })
      ? [
          {
            organizationId: org.id,
            organizationName: org.name,
            canManage: hasOrganizationAccess({
              session: session.data,
              organizationId: org.id,
              scope: "gateway:manage",
            }),
          },
        ]
      : [];
  const gatewayLaunchTarget = useGatewayLaunchTarget(gatewayLaunchCandidates);
  const userId = session.data?.user?.id;

  if (landing && !landing.canUseGateway) {
    return (
      <ErrorPage
        title="No access to this organization"
        message="AI Gateway is not enabled for this organization. Ask an organization admin to change your role."
      />
    );
  }

  if (organizations === undefined) {
    return "loading...";
  }

  if (!org) {
    return (
      <ErrorPage
        title="Organization not found"
        message="This organization does not exist or you do not have access to it."
      />
    );
  }

  return (
    <SingleOrganizationPage
      org={org}
      search={search ?? undefined}
      banner={pageBanner({
        v4UpgradeUiEnabled,
        gatewayBanner:
          gatewayLaunchTarget && userId ? (
            <GatewayLaunchBanner target={gatewayLaunchTarget} userId={userId} />
          ) : null,
      })}
    />
  );
};

/** One banner at a time: the gateway launch, else the agent-tools pitch. */
const pageBanner = ({
  v4UpgradeUiEnabled,
  gatewayBanner,
}: {
  v4UpgradeUiEnabled: boolean;
  gatewayBanner: ReactNode;
}): ReactNode => {
  if (gatewayBanner) return gatewayBanner;
  return v4UpgradeUiEnabled ? null : <AgentToolsBanner />;
};

type Organization = NonNullable<Session["user"]>["organizations"][number];
