import {
  BookOpen,
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
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { StringParam, useQueryParams } from "use-query-params";
import { Input } from "@/src/components/ui/input";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { env } from "@/src/env.mjs";
import { Fragment } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import {
  createOrganizationRoute,
  createProjectRoute,
} from "@/src/features/setup/setupRoutes";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import ContainerPage from "@/src/components/layouts/container-page";
import { type Session } from "next-auth";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { AgentToolsBanner } from "@/src/features/developer-tools/components/AgentToolsBanner";
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
import { useLocale, useTranslations } from "next-intl";
import { getAppLocale } from "@/src/features/i18n/config";

const OrganizationProjectTiles = ({
  org,
  search,
}: {
  org: NonNullable<Session["user"]>["organizations"][number];
  search?: string;
}) => {
  const t = useTranslations("workspace.overview");
  const locale = getAppLocale(useLocale());
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
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
  const projects = org.projects.filter(
    (project) =>
      !search || project.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (projects.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-sm">
        {t(org.projects.length === 0 ? "emptyProjects" : "noMatchingProjects")}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
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
                aria-label={t("goToProjectNamed", { name: project.name })}
              />
            )}
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="truncate text-base" title={project.name}>
                  {project.name}
                </CardTitle>
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
                    ? (() => {
                        const lastTraceAt = lastTraceQuery.data?.find(
                          (t) => t.projectId === project.id,
                        )?.lastTraceAt;
                        return lastTraceAt
                          ? t("lastTrace", {
                              time: formatCompactRelativeTime(
                                new Date(lastTraceAt),
                                locale,
                              ),
                            })
                          : t("noRecentTraces");
                      })()
                    : null}
                </p>
              </CardContent>
            )}
            {project.deletedAt && (
              <CardContent>
                <CardDescription>{t("projectDeleting")}</CardDescription>
              </CardContent>
            )}
          </Card>
        ) : (
          <Card key={project.id}>
            <CardHeader>
              <CardTitle className="truncate text-base" title={project.name}>
                {project.name}
              </CardTitle>
            </CardHeader>
            {!project.deletedAt ? (
              <CardFooter className="gap-2">
                <Button asChild variant="secondary">
                  <Link href={`/project/${project.id}`}>
                    {t("goToProject")}
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link
                    href={`/project/${project.id}/settings`}
                    aria-label={t("projectSettingsNamed", {
                      name: project.name,
                    })}
                  >
                    <Settings size={16} />
                  </Link>
                </Button>
              </CardFooter>
            ) : (
              <CardContent>
                <CardDescription>{t("projectDeleting")}</CardDescription>
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
  const t = useTranslations("workspace.overview");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("demoTitle")}</CardTitle>
      </CardHeader>
      <CardContent>{t("demoDescription")}</CardContent>
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
            {t("viewDemoProject")}
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
  const t = useTranslations("workspace.overview");
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
      <Button asChild variant="ghost">
        <Link
          href={`/organization/${orgId}/settings`}
          aria-label={t("organizationSettings")}
        >
          <Settings size={14} />
        </Link>
      </Button>
      {membersViewAccess && (
        <Button asChild variant="ghost">
          <Link
            href={`/organization/${orgId}/settings/members`}
            aria-label={t("organizationMembers")}
          >
            <Users size={14} />
          </Link>
        </Button>
      )}
      {createProjectAccess ? (
        <Button asChild variant={primaryButtonVariant}>
          <Link href={createProjectRoute(orgId)}>
            <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("newProject")}
          </Link>
        </Button>
      ) : (
        <Button disabled variant={primaryButtonVariant}>
          <LockIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("newProject")}
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
  const t = useTranslations("workspace.overview");
  const isDemoOrg =
    env.NEXT_PUBLIC_DEMO_ORG_ID === org.id &&
    org.projects.some((p) => p.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID);

  if (isDemoOrg) {
    return (
      <ContainerPage
        headerProps={{
          title: t("demoOrganization"),
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
  const t = useTranslations("workspace.overview");
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
          org.id === env.NEXT_PUBLIC_DEMO_ORG_ID
            ? t("demoOrganizationBadge")
            : undefined
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
      <OrganizationProjectTiles org={org} search={search} />
    </div>
  );
};

export const OrganizationProjectOverview = () => {
  const t = useTranslations("workspace.overview");
  const router = useRouter();
  const queryOrgId = router.query.organizationId;
  const session = useSession();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const canCreateOrg = session.data?.user?.canCreateOrganizations;
  const organizations = session.data?.user?.organizations;
  const [{ search }, setQueryParams] = useQueryParams({ search: StringParam });
  const v4MigrationBannerState = useV4MigrationBannerState(v4UpgradeUiEnabled);

  if (organizations === undefined) {
    return t("loading");
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
        title: t("title"),
        help: {
          description: t("help"),
          href: "https://langfuse.com/docs/rbac",
        },
        breadcrumb: [
          {
            name: t("title"),
            href: "/",
          },
        ],
        actionButtonsRight: (
          <>
            <Input
              className="mr-1 w-36 lg:w-56"
              placeholder={t("searchProjects")}
              onChange={(e) => setQueryParams({ search: e.target.value })}
            />
            {canCreateOrg && (
              <Button data-testid="create-organization-btn" asChild>
                <Link href={createOrganizationRoute}>
                  <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t("newOrganization")}
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

const Onboarding = () => {
  const t = useTranslations("workspace.overview");
  const session = useSession();
  const canCreateOrgs = session.data?.user?.canCreateOrganizations;
  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle data-testid="create-new-project-title">
          {t("getStarted")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>
          {canCreateOrgs
            ? t("createOrganizationToStart")
            : t("invitationRequired")}
        </CardDescription>
      </CardContent>
      <CardFooter className="flex gap-4">
        {canCreateOrgs && (
          <Button data-testid="create-project-btn" asChild>
            <Link href={createOrganizationRoute}>
              <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("newOrganization")}
            </Link>
          </Button>
        )}
        <Button variant="secondary" asChild>
          <Link href="https://langfuse.com/docs" target="_blank">
            <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("docs")}
          </Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="https://langfuse.com/docs/ask-ai" target="_blank">
            <MessageSquareText className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("askAi")}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};
