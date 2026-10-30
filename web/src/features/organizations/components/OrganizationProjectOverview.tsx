/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  BookOpen,
  LockIcon,
  MessageSquareText,
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
import { Separator } from "@/src/components/ui/separator";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { StringParam, useQueryParams } from "use-query-params";
import { Input } from "@/src/components/ui/input";
import {
  hasOrganizationAccess,
  useHasOrganizationAccess,
} from "@/src/features/rbac";
import { env } from "@/src/env.mjs";
import { Fragment, type ReactNode } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import {
  createOrganizationRoute,
  createProjectRoute,
} from "@/src/features/setup";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import ContainerPage from "@/src/components/layouts/ContainerPage";
import { type Session } from "next-auth";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { AgentToolsBanner } from "@/src/features/developer-tools";
import {
  V4MigrationBanner,
  useV4MigrationBannerState,
} from "@/src/features/v4-migration/V4MigrationBanner";
import { V4MigrationProjectChip } from "@/src/features/v4-migration/V4MigrationProjectChip";
import { api } from "@/src/utils/api";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useAccountV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { ErrorPage } from "@/src/components/error-page";
import { GatewayLaunchBanner } from "@/src/features/ai-gateway/components/GatewayLaunch/GatewayLaunchBanner";
import { useGatewayKeyReminder } from "@/src/features/ai-gateway/hooks/useGatewayKeyReminder";
import { useGatewayLaunchTarget } from "@/src/features/ai-gateway/hooks/useGatewayLaunchEligibility";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { gatewayOnlyLanding } from "@/src/features/organizations/utils/gatewayOnlyLanding";

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

const DemoOrganizationTile = () => {
  const capture = usePostHogClientCapture();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Try Langfuse Demo</CardTitle>
      </CardHeader>
      <CardContent>
        We have built a Q&A chatbot that answers questions based on the Langfuse
        Docs. Interact with it to see traces in Langfuse.
      </CardContent>
      <CardFooter>
        <Button asChild variant="secondary">
          <Link
            href={`/project/${env.NEXT_PUBLIC_DEMO_PROJECT_ID}/traces`}
            onClick={() =>
              capture("organizations:demo_project_button_click", {
                location: "project_overview_demo_tile",
              })
            }
          >
            View Demo Project
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

const OrganizationActionButtons = ({
  orgId,
  primaryButtonVariant = "default",
}: {
  orgId: string;
  primaryButtonVariant?: "default" | "secondary";
}) => {
  const membersViewAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:read",
  });
  const createProjectAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "projects:create",
  });
  const gatewayKeyReminder = useGatewayKeyReminder(orgId);

  return (
    <>
      <Button asChild variant="ghost" className="relative">
        <Link
          href={`/organization/${orgId}/settings`}
          aria-label={
            gatewayKeyReminder
              ? "Organization settings: get your AI Gateway API key"
              : "Organization settings"
          }
        >
          <Settings size="base" color="default" />
          {gatewayKeyReminder && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 size-1.75 rounded-full bg-orange-400"
            />
          )}
        </Link>
      </Button>
      {membersViewAccess && (
        <Button asChild variant="ghost">
          <Link href={`/organization/${orgId}/settings/members`}>
            <Users size="base" color="default" />
          </Link>
        </Button>
      )}
      {createProjectAccess ? (
        <Button asChild variant={primaryButtonVariant}>
          <Link href={createProjectRoute(orgId)}>
            <PlusIcon size="base" __rawClassName="mr-2" aria-hidden="true" />
            New project
          </Link>
        </Button>
      ) : (
        <Button disabled variant={primaryButtonVariant}>
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
}: {
  org: NonNullable<Session["user"]>["organizations"][number];
  search?: string;
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
        title: org.name,
        actionButtonsRight: <OrganizationActionButtons orgId={org.id} />,
      }}
    >
      <OrganizationProjectTiles org={org} search={search} />
    </ContainerPage>
  );
};

const SingleOrganizationProjectOverviewTile = ({
  org,
  search,
}: {
  org: NonNullable<Session["user"]>["organizations"][number];
  search?: string;
}) => {
  const isDemoOrg =
    env.NEXT_PUBLIC_DEMO_ORG_ID === org.id &&
    org.projects.some((p) => p.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID);

  if (isDemoOrg) {
    return (
      <div key={org.id}>
        <DemoOrganizationTile />
      </div>
    );
  }

  return (
    <div key={org.id}>
      <Header
        title={org.name}
        className="truncate"
        labelBadge={
          org.id === env.NEXT_PUBLIC_DEMO_ORG_ID ? "Demo Org" : undefined
        }
        label={
          isCloudPlan(org.plan)
            ? {
                text: planLabels[org.plan],
                href: `/organization/${org.id}/settings/billing`,
              }
            : undefined
        }
        actionButtons={
          <OrganizationActionButtons
            orgId={org.id}
            primaryButtonVariant="secondary"
          />
        }
      />
      <OrganizationProjects org={org} search={search} />
    </div>
  );
};

/** OrganizationProjects lists the org's projects, or points to its settings when the user has none */
const OrganizationProjects = ({
  org,
  search,
}: {
  org: Organization;
  search?: string;
}) => {
  if (org.projects.length === 0) {
    return <OrganizationSettingsTile orgId={org.id} />;
  }
  return <OrganizationProjectTiles org={org} search={search} />;
};

/** OrganizationSettingsTile links to the org's settings, and to project creation when allowed */
const OrganizationSettingsTile = ({ orgId }: { orgId: string }) => {
  const canCreateProject = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "projects:create",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">No projects</CardTitle>
        <CardDescription>
          <NoProjectsDescription canCreateProject={canCreateProject} />
        </CardDescription>
      </CardHeader>
      <CardFooter className="gap-2">
        {canCreateProject && (
          <Button asChild>
            <Link href={createProjectRoute(orgId)}>
              <PlusIcon size="base" __rawClassName="mr-2" aria-hidden="true" />
              New project
            </Link>
          </Button>
        )}
        <Button asChild variant="secondary">
          <Link href={`/organization/${orgId}/settings`}>
            <Settings size="base" __rawClassName="mr-2" aria-hidden="true" />
            Organization settings
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

/** NoProjectsDescription explains an empty project list by whether the user can create projects */
const NoProjectsDescription = ({
  canCreateProject,
}: {
  canCreateProject: boolean;
}) => {
  if (canCreateProject) return <>This organization has no projects yet.</>;
  return <>You don&apos;t have access to any projects in this organization.</>;
};

export const OrganizationProjectOverview = () => {
  const router = useRouter();
  const queryOrgId = router.query.organizationId;
  const session = useSession();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const canCreateOrg = session.data?.user?.canCreateOrganizations;
  const organizations = session.data?.user?.organizations;
  const [{ search }, setQueryParams] = useQueryParams({ search: StringParam });
  const v4MigrationBannerState = useV4MigrationBannerState(v4UpgradeUiEnabled);
  const landing = gatewayOnlyLanding(session.data, queryOrgId);
  const gatewayLaunchCandidates = (organizations ?? [])
    .filter(
      (org) =>
        org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID &&
        getContextualFeatureFlags(session.data?.user, {
          organizationId: org.id,
        })?.aiGateway === true &&
        hasOrganizationAccess({
          session: session.data,
          organizationId: org.id,
          scope: "gateway:invoke",
        }),
    )
    .map((org) => ({
      organizationId: org.id,
      organizationName: org.name,
      canManage: hasOrganizationAccess({
        session: session.data,
        organizationId: org.id,
        scope: "gateway:manage",
      }),
    }));
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

  const showOnboarding =
    organizations.filter((org) => org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID)
      .length === 0 && !queryOrgId;

  if (queryOrgId) {
    const org = organizations.find((org) => org.id === queryOrgId);

    if (!org) {
      return (
        <ErrorPage
          title="Organization not found"
          message="This organization does not exist or you do not have access to it."
        />
      );
    }

    return <SingleOrganizationPage org={org} search={search ?? undefined} />;
  }

  return (
    <ContainerPage
      headerProps={{
        title: "Organizations",
        help: {
          description:
            "Organizations help you manage access to projects. Each organization can have multiple projects and team members with different roles.",
          href: "https://langfuse.com/docs/rbac",
        },
        breadcrumb: [
          {
            name: "Organizations",
            href: "/",
          },
        ],
        actionButtonsRight: (
          <>
            <Input
              className="mr-1 w-36 lg:w-56"
              placeholder="Search projects"
              onChange={(e) => setQueryParams({ search: e.target.value })}
            />
            {canCreateOrg && (
              <Button
                data-testid="create-organization-btn"
                variant="secondary"
                asChild
              >
                <Link href={createOrganizationRoute}>
                  <PlusIcon
                    size="base"
                    color="default"
                    __rawClassName="mr-1.5"
                    aria-hidden="true"
                  />
                  New Organization
                </Link>
              </Button>
            )}
          </>
        ),
      }}
    >
      {pageBanner({
        v4UpgradeUiEnabled,
        v4MigrationBannerState,
        gatewayBanner:
          gatewayLaunchTarget && userId ? (
            <GatewayLaunchBanner target={gatewayLaunchTarget} userId={userId} />
          ) : null,
      })}
      {showOnboarding && <Onboarding />}
      {organizations
        .map((org) => {
          const isDemo = env.NEXT_PUBLIC_DEMO_ORG_ID === org.id;
          return [org, isDemo] as const;
        })
        .sort(([, isDemoA], [, isDemoB]) => {
          if (isDemoA) return 1;
          if (isDemoB) return -1;
          return 0;
        })
        .map(([org, isDemo], index) => {
          return (
            <Fragment key={org.id}>
              {!queryOrgId && isDemo && <Separator className="my-8" />}
              <div key={org.id} className={index > 0 && !isDemo ? "mt-8" : ""}>
                <SingleOrganizationProjectOverviewTile
                  org={org}
                  search={search ?? undefined}
                />
              </div>
            </Fragment>
          );
        })}
    </ContainerPage>
  );
};

/** One banner at a time: v4 migration work first, then the gateway launch. */
const pageBanner = ({
  v4UpgradeUiEnabled,
  v4MigrationBannerState,
  gatewayBanner,
}: {
  v4UpgradeUiEnabled: boolean;
  v4MigrationBannerState: ReturnType<typeof useV4MigrationBannerState>;
  gatewayBanner: ReactNode;
}): ReactNode => {
  if (
    v4UpgradeUiEnabled &&
    v4MigrationBannerState.projectsNeedingMigration > 0
  ) {
    return (
      <V4MigrationBanner
        projectsNeedingMigration={
          v4MigrationBannerState.projectsNeedingMigration
        }
        totalProjects={v4MigrationBannerState.totalProjects}
      />
    );
  }
  if (gatewayBanner) return gatewayBanner;
  return v4UpgradeUiEnabled ? null : <AgentToolsBanner />;
};

const Onboarding = () => {
  const session = useSession();
  const canCreateOrgs = session.data?.user?.canCreateOrganizations;
  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle data-testid="create-new-project-title">
          Get Started
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>
          {canCreateOrgs
            ? "Create an organization to get started. Alternatively, ask your organization admin to invite you."
            : "You need to get invited to an organization to get started with Langfuse."}
        </CardDescription>
      </CardContent>
      <CardFooter className="flex gap-4">
        {canCreateOrgs && (
          <Button data-testid="create-project-btn" asChild>
            <Link href={createOrganizationRoute}>
              <PlusIcon size="base" __rawClassName="mr-2" aria-hidden="true" />
              New Organization
            </Link>
          </Button>
        )}
        <Button variant="secondary" asChild>
          <Link href="https://langfuse.com/docs" target="_blank">
            <BookOpen size="base" __rawClassName="mr-2" aria-hidden="true" />
            Docs
          </Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="https://langfuse.com/docs/ask-ai" target="_blank">
            <MessageSquareText
              size="base"
              __rawClassName="mr-2"
              aria-hidden="true"
            />
            Ask AI
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

type Organization = NonNullable<Session["user"]>["organizations"][number];
