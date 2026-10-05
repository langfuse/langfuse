import {
  BookOpen,
  EllipsisVertical,
  LockIcon,
  MessageSquareText,
  Settings,
  Users,
  PlusIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Separator } from "@/src/components/ui/separator";
import {
  DropdownMenuController,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { StringParam, useQueryParams } from "use-query-params";
import { Input } from "@/src/components/ui/input";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { env } from "@/src/env.mjs";
import { Fragment, useMemo } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import {
  createOrganizationRoute,
  createProjectRoute,
} from "@/src/features/setup";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import ContainerPage from "@/src/components/layouts/container-page";
import { type Session } from "next-auth";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { AgentToolsBanner } from "@/src/features/developer-tools";
import {
  V4MigrationBanner,
  useV4MigrationBannerState,
} from "@/src/features/v4-migration/V4MigrationBanner";
import { V4MigrationProjectChip } from "@/src/features/v4-migration/V4MigrationProjectChip";
import { api } from "@/src/utils/api";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useAccountV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { ErrorPage } from "@/src/components/error-page";
import {
  PinnedProjectsSection,
  selectPinnedProjects,
} from "@/src/features/organizations/components/PinnedProjectsSection";
import {
  formatLastTrace,
  type LastTraceAt,
} from "@/src/features/organizations/components/projectActivity";
import { useProjectStars } from "@/src/features/organizations/useProjectStars";
import { ProjectStarButton } from "@/src/features/organizations/components/ProjectStarButton";
import { useRecentProjects } from "@/src/features/organizations/useRecentProjects";

const OrganizationProjectTiles = ({
  org,
  search,
  isStarred,
  onToggleStar,
}: {
  org: NonNullable<Session["user"]>["organizations"][number];
  search?: string;
  isStarred: (projectId: string) => boolean;
  onToggleStar: (projectId: string) => void;
}) => {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const lastTraceQuery = api.organizations.lastTraceByProject.useQuery({
    orgId: org.id,
  });
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
          const lastTraceAt = lastTraceQuery.data?.find(
            (t) => t.projectId === project.id,
          )?.lastTraceAt;

          return (
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
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="truncate text-base" title={project.name}>
                  {project.name}
                </CardTitle>
                <div className="flex shrink-0 items-center gap-1">
                  {!project.deletedAt &&
                    v4UpgradeUiEnabled &&
                    (migrationReadiness === "action-needed" ||
                      migrationReadiness === "partner-managed") && (
                      <V4MigrationProjectChip
                        project={{ id: project.id, name: project.name }}
                        readiness={migrationReadiness}
                      />
                    )}
                  {!project.deletedAt && (
                    <ProjectStarButton
                      projectId={project.id}
                      isStarred={isStarred(project.id)}
                      onToggle={onToggleStar}
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent className="min-h-7 pb-4">
                {project.deletedAt ? (
                  <CardDescription>Project is being deleted</CardDescription>
                ) : (
                  <p className="text-muted-foreground font-mono text-xs">
                    {lastTraceQuery.isSuccess
                      ? formatLastTrace(lastTraceAt)
                      : null}
                  </p>
                )}
              </CardContent>
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
  layout = "icons",
}: {
  orgId: string;
  primaryButtonVariant?: "default" | "secondary";
  /** `icons`: settings and members as ghost icon buttons. `menu`: both behind one ⋯ menu. */
  layout?: "icons" | "menu";
}) => {
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
      {layout === "menu" ? (
        <DropdownMenuController
          align="end"
          renderMenu={() => (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/organization/${orgId}/settings`}>
                  <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                  Organization settings
                </Link>
              </DropdownMenuItem>
              {membersViewAccess && (
                <DropdownMenuItem asChild>
                  <Link href={`/organization/${orgId}/settings/members`}>
                    <Users className="mr-2 h-4 w-4" aria-hidden="true" />
                    Members
                  </Link>
                </DropdownMenuItem>
              )}
            </>
          )}
        >
          {({ Trigger }) => (
            <Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Organization actions"
              >
                <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Trigger>
          )}
        </DropdownMenuController>
      ) : (
        <>
          <Button asChild variant="ghost">
            <Link href={`/organization/${orgId}/settings`}>
              <Settings size={14} />
            </Link>
          </Button>
          {membersViewAccess && (
            <Button asChild variant="ghost">
              <Link href={`/organization/${orgId}/settings/members`}>
                <Users size={14} />
              </Link>
            </Button>
          )}
        </>
      )}
      {createProjectAccess ? (
        <Button asChild variant={primaryButtonVariant}>
          <Link href={createProjectRoute(orgId)}>
            <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            New project
          </Link>
        </Button>
      ) : (
        <Button disabled variant={primaryButtonVariant}>
          <LockIcon className="mr-2 h-4 w-4" aria-hidden="true" />
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
  const { isStarred, toggle: onToggleStar } = useProjectStars();
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
      <OrganizationProjectTiles
        org={org}
        search={search}
        isStarred={isStarred}
        onToggleStar={onToggleStar}
      />
    </ContainerPage>
  );
};

const SingleOrganizationProjectOverviewTile = ({
  org,
  search,
  isStarred,
  onToggleStar,
}: {
  org: NonNullable<Session["user"]>["organizations"][number];
  search?: string;
  isStarred: (projectId: string) => boolean;
  onToggleStar: (projectId: string) => void;
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
            layout="menu"
          />
        }
      />
      <OrganizationProjectTiles
        org={org}
        search={search}
        isStarred={isStarred}
        onToggleStar={onToggleStar}
      />
    </div>
  );
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
  const { starredIds, isStarred, toggle: toggleStar } = useProjectStars();
  const recentIds = useRecentProjects();
  const lastTraceQueries = api.useQueries((t) =>
    (organizations ?? []).map((org) =>
      t.organizations.lastTraceByProject({ orgId: org.id }),
    ),
  );
  const lastTraceByProjectId = useMemo(() => {
    const map = new Map<string, LastTraceAt>();
    for (const q of lastTraceQueries) {
      for (const row of q.data ?? []) map.set(row.projectId, row.lastTraceAt);
    }
    return map;
  }, [lastTraceQueries]);

  const pinnedProjects = useMemo(
    () =>
      selectPinnedProjects({
        organizations: (organizations ?? []).filter(
          (org) => org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID,
        ),
        starredIds,
        recentIds,
        lastTraceByProjectId,
        search: search ?? undefined,
      }),
    [organizations, starredIds, recentIds, lastTraceByProjectId, search],
  );

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
              <Button data-testid="create-organization-btn" asChild>
                <Link href={createOrganizationRoute}>
                  <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  New Organization
                </Link>
              </Button>
            )}
          </>
        ),
      }}
    >
      {v4UpgradeUiEnabled ? (
        v4MigrationBannerState.projectsNeedingMigration > 0 && (
          <V4MigrationBanner
            projectsNeedingMigration={
              v4MigrationBannerState.projectsNeedingMigration
            }
            totalProjects={v4MigrationBannerState.totalProjects}
          />
        )
      ) : (
        <AgentToolsBanner />
      )}
      {showOnboarding && <Onboarding />}
      {!showOnboarding && pinnedProjects.length > 0 && (
        <div className="mb-10">
          <PinnedProjectsSection
            projects={pinnedProjects}
            isStarred={isStarred}
            onToggleStar={toggleStar}
          />
        </div>
      )}
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
                  isStarred={isStarred}
                  onToggleStar={toggleStar}
                />
              </div>
            </Fragment>
          );
        })}
    </ContainerPage>
  );
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
              <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              New Organization
            </Link>
          </Button>
        )}
        <Button variant="secondary" asChild>
          <Link href="https://langfuse.com/docs" target="_blank">
            <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
            Docs
          </Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="https://langfuse.com/docs/ask-ai" target="_blank">
            <MessageSquareText className="mr-2 h-4 w-4" aria-hidden="true" />
            Ask AI
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};
