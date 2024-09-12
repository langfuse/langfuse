import { Building2, LifeBuoy, LockIcon, Settings, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { StringParam, useQueryParams } from "use-query-params";
import { Input } from "@/src/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/src/components/ui/alert";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { env } from "@/src/env.mjs";
import { Divider } from "@tremor/react";
import { Fragment } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import {
  createOrganizationRoute,
  createProjectRoute,
} from "@/src/features/setup/setupRoutes";
import { isCloudPlan, planLabels } from "@langfuse/shared";

const SingleOrganizationProjectOverview = ({
  orgId,
  search,
  level = "h2",
}: {
  orgId: string;
  search?: string;
  level?: "h2" | "h3";
}) => {
  const createProjectAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "projects:create",
  });
  const membersViewAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:read",
  });
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
        {level === "h2" && <Header title="Demo Organization" />}
        <Card>
          <CardHeader>
            <CardTitle>Try Langfuse Demo</CardTitle>
          </CardHeader>
          <CardContent>
            We have built a Q&A chatbot that answers questions based on the
            Langfuse Docs. Interact with it to see traces in Langfuse.
          </CardContent>
          <CardFooter>
            <Button asChild variant="secondary">
              <Link href={`/project/${env.NEXT_PUBLIC_DEMO_PROJECT_ID}`}>
                View Demo Project
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div key={orgId} className="mb-10">
      <Header
        title={org.name}
        level={level}
        status={orgId === env.NEXT_PUBLIC_DEMO_ORG_ID ? "Demo Org" : undefined}
        label={
          isCloudPlan(org.plan) && level === "h3"
            ? {
                text: planLabels[org.plan],
                href: `/organization/${org.id}/settings/billing`,
              }
            : undefined
        }
        actionButtons={
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
              <Button asChild variant="secondary">
                <Link href={createProjectRoute(orgId)}>
                  <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                  New project
                </Link>
              </Button>
            ) : (
              <Button variant="secondary" disabled>
                <LockIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                New project
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {org.projects
          .filter(
            (p) =>
              !search || p.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <CardTitle className="text-base">{project.name}</CardTitle>
              </CardHeader>
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
            </Card>
          ))}
      </div>
    </div>
  );
};

export const OrganizationProjectOverview = () => {
  const router = useRouter();
  const queryOrgId = router.query.organizationId;
  const session = useSession();
  const canCreateOrg = session.data?.user?.canCreateOrganizations;
  const organizations = session.data?.user?.organizations;
  const [{ search }, setQueryParams] = useQueryParams({ search: StringParam });

  if (organizations === undefined) {
    return "loading...";
  }

  const showOnboarding =
    organizations.filter((org) => org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID)
      .length === 0 && !queryOrgId;

  return (
    <div className="md:container">
      {!queryOrgId && (
        <>
          <Header
            title="Home"
            actionButtons={
              <>
                <Input
                  className="w-36 lg:w-56"
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
            }
          />
          {!showOnboarding && <IntroducingOrganizations />}
        </>
      )}
      {showOnboarding && <Onboarding />}
      {organizations
        .filter((org) => queryOrgId === undefined || org.id === queryOrgId)
        .sort((a, b) => {
          // sort demo org to the bottom
          const isDemoA = env.NEXT_PUBLIC_DEMO_ORG_ID === a.id;
          const isDemoB = env.NEXT_PUBLIC_DEMO_ORG_ID === b.id;
          if (isDemoA) return 1;
          if (isDemoB) return -1;
          return 0;
        })
        .map((org) => (
          <Fragment key={org.id}>
            {!queryOrgId && org.id === env.NEXT_PUBLIC_DEMO_ORG_ID && (
              <Divider />
            )}
            <SingleOrganizationProjectOverview
              orgId={org.id}
              search={search ?? undefined}
              level={queryOrgId ? "h2" : "h3"}
            />
          </Fragment>
        ))}
    </div>
  );
};

const IntroducingOrganizations = () => (
  <Alert className="mb-10 mt-5">
    <Building2 className="h-4 w-4" />
    <AlertTitle>Introducing Organizations</AlertTitle>
    <AlertDescription>
      Organizations are a way to group projects and manage access to them. See{" "}
      <Link
        href="https://langfuse.com/changelog/2024-08-13-organizations"
        className="underline"
        target="_blank"
      >
        changelog
      </Link>{" "}
      to learn more.
    </AlertDescription>
  </Alert>
);

const Onboarding = () => {
  const session = useSession();
  const canCreateOrgs = session.data?.user?.canCreateOrganizations;
  return (
    <Card>
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
          <Link href="/support">
            <LifeBuoy className="mr-2 h-4 w-4" aria-hidden="true" />
            Support
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};
