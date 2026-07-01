import {
  ArrowDownAZ,
  BookOpen,
  LockIcon,
  MessageSquareText,
  PlusIcon,
  Settings,
  Users,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import Link from "next/link";
import { StringParam, useQueryParams } from "use-query-params";
import { Input } from "@/src/components/ui/input";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
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
import { type User } from "next-auth";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { AgentToolsBanner } from "@/src/features/developer-tools/components/AgentToolsBanner";

type ProjectSortOrder = "asc" | "desc";

const PROJECT_SORT_OPTIONS: { label: string; value: ProjectSortOrder }[] = [
  { label: "A-Z", value: "asc" },
  { label: "Z-A", value: "desc" },
];

function parseProjectSortOrder(
  value: string | null | undefined,
): ProjectSortOrder | undefined {
  if (value === "asc" || value === "desc") {
    return value;
  }
  return undefined;
}

export function getSortedOrganizationProjects<
  T extends { name: string; id: string },
>(
  projects: T[],
  {
    search,
    sort,
  }: {
    search?: string;
    sort?: ProjectSortOrder;
  },
): T[] {
  const filtered = projects.filter(
    (project) =>
      !search || project.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (sort === "asc") {
    return filtered.toSorted((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
  }

  if (sort === "desc") {
    return filtered.toSorted((a, b) =>
      b.name.localeCompare(a.name, "en", { sensitivity: "base" }),
    );
  }

  return filtered;
}

const ProjectSortDropdown = ({
  value,
  onChange,
}: {
  value?: ProjectSortOrder;
  onChange: (value: ProjectSortOrder | undefined) => void;
}) => {
  const activeOption = PROJECT_SORT_OPTIONS.find(
    (option) => option.value === value,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Sort projects">
          <ArrowDownAZ className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {activeOption?.label ?? "Sort"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={value ?? "default"}
          onValueChange={(nextValue) =>
            onChange(
              nextValue === "default"
                ? undefined
                : parseProjectSortOrder(nextValue),
            )
          }
        >
          <DropdownMenuRadioItem value="default">
            Default order
          </DropdownMenuRadioItem>
          {PROJECT_SORT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const OrganizationProjectTiles = ({
  org,
  search,
  sort,
}: {
  org: User["organizations"][number];
  search?: string;
  sort?: ProjectSortOrder;
}) => {
  const projects = getSortedOrganizationProjects(org.projects, {
    search,
    sort,
  });

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <Card key={project.id}>
          <CardHeader>
            <CardTitle className="truncate text-base">{project.name}</CardTitle>
          </CardHeader>
          {!project.deletedAt ? (
            <CardFooter className="gap-2">
              <Button asChild variant="secondary">
                <Link href={`/project/${project.id}`}>Go to project</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href={`/project/${project.id}/settings`}>
                  <Settings size={16} />
                </Link>
              </Button>
            </CardFooter>
          ) : (
            <CardContent>
              <CardDescription>Project is being deleted</CardDescription>
            </CardContent>
          )}
        </Card>
      ))}
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

  return (
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
  orgId,
  search,
  sort,
  onSortChange,
}: {
  orgId: string;
  search?: string;
  sort?: ProjectSortOrder;
  onSortChange: (sort: ProjectSortOrder | undefined) => void;
}) => {
  const session = useSession();
  const org = session.data?.user?.organizations.find((o) => o.id === orgId);

  if (!org) {
    return null;
  }

  const isDemoOrg =
    env.NEXT_PUBLIC_DEMO_ORG_ID === orgId &&
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
        title: org?.name ?? "Organization",
        actionButtonsRight: (
          <>
            <ProjectSortDropdown value={sort} onChange={onSortChange} />
            <OrganizationActionButtons orgId={orgId} />
          </>
        ),
      }}
    >
      <OrganizationProjectTiles org={org} search={search} sort={sort} />
    </ContainerPage>
  );
};

const SingleOrganizationProjectOverviewTile = ({
  orgId,
  search,
  sort,
}: {
  orgId: string;
  search?: string;
  sort?: ProjectSortOrder;
}) => {
  const session = useSession();
  const org = session.data?.user?.organizations.find((o) => o.id === orgId);

  if (!org) {
    return null;
  }

  const isDemoOrg =
    env.NEXT_PUBLIC_DEMO_ORG_ID === orgId &&
    org.projects.some((p) => p.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID);

  if (isDemoOrg) {
    return (
      <div key={orgId}>
        <DemoOrganizationTile />
      </div>
    );
  }

  return (
    <div key={orgId}>
      <Header
        title={org.name}
        className="truncate"
        status={orgId === env.NEXT_PUBLIC_DEMO_ORG_ID ? "Demo Org" : undefined}
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
            orgId={orgId}
            primaryButtonVariant="secondary"
          />
        }
      />
      <OrganizationProjectTiles org={org} search={search} sort={sort} />
    </div>
  );
};

export const OrganizationProjectOverview = () => {
  const router = useRouter();
  const queryOrgId = router.query.organizationId;
  const session = useSession();
  const canCreateOrg = session.data?.user?.canCreateOrganizations;
  const organizations = session.data?.user?.organizations;
  const [{ search, projectSort }, setQueryParams] = useQueryParams({
    search: StringParam,
    projectSort: StringParam,
  });
  const sort = parseProjectSortOrder(projectSort);

  const setProjectSort = (nextSort: ProjectSortOrder | undefined) => {
    setQueryParams({ projectSort: nextSort ?? undefined });
  };

  if (organizations === undefined) {
    return "loading...";
  }

  const showOnboarding =
    organizations.filter((org) => org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID)
      .length === 0 && !queryOrgId;

  if (queryOrgId) {
    const org = organizations.find((org) => org.id === queryOrgId);

    if (!org) {
      return null;
    }

    return (
      <SingleOrganizationPage
        orgId={org.id}
        search={search ?? undefined}
        sort={sort}
        onSortChange={setProjectSort}
      />
    );
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
            <ProjectSortDropdown value={sort} onChange={setProjectSort} />
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
      <AgentToolsBanner />
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
                  orgId={org.id}
                  search={search ?? undefined}
                  sort={sort}
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
