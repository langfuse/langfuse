import {
  Building2,
  LifeBuoy,
  LockIcon,
  Settings,
  TriangleAlert,
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
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { StringParam, useQueryParams } from "use-query-params";
import { Input } from "@/src/components/ui/input";
import { createProjectRoute } from "@/src/components/setup";
import { Alert, AlertTitle, AlertDescription } from "@/src/components/ui/alert";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { env } from "@/src/env.mjs";
import { Divider } from "@tremor/react";
import { Badge } from "@/src/components/ui/badge";
import { Fragment } from "react";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { type RouterOutput } from "@/src/utils/types";
import { useSession } from "next-auth/react";

export const SingleOrganizationProjectOverview = ({
  org,
  search,
  level = "h2",
}: {
  org: RouterOutput["organizations"]["all"][0];
  search?: string;
  level?: "h2" | "h3";
}) => {
  const createProjectAccess = useHasOrganizationAccess({
    organizationId: org.id,
    scope: "projects:create",
  });
  const membersViewAccess = useHasOrganizationAccess({
    organizationId: org.id,
    scope: "organizationMembers:read",
  });
  const session = useSession();

  const isDemoOrg =
    env.NEXT_PUBLIC_DEMO_ORG_ID === org.id &&
    org.projects.some((p) => p.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID) &&
    session.data?.user?.organizations.find((o) => o.id === org.id)?.role ===
      "NONE";

  if (isDemoOrg) {
    return (
      <div key={org.id}>
        {level === "h2" && <Header title="Demo Organization" />}
        <Card>
          <CardHeader>
            <CardTitle>Try Langfuse Demo</CardTitle>
            <CardDescription>
              Explore Langfuse features by interacting with the demo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>
              We have built a Q&A chatbot that answers questions based on the
              Langfuse Docs. Interact with it to see traces in Langfuse.
            </p>
            <Button asChild className="mt-4" variant="secondary">
              <Link href={`/project/${env.NEXT_PUBLIC_DEMO_PROJECT_ID}`}>
                Go to Demo Project
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div key={org.id} className="mb-10">
      <Header
        title={org.name}
        level={level}
        status={org.id === env.NEXT_PUBLIC_DEMO_ORG_ID ? "Demo Org" : undefined}
        actionButtons={
          <>
            <Button asChild variant="ghost">
              <Link href={`/organization/${org.id}/settings`}>
                <Settings size={14} />
              </Link>
            </Button>
            {membersViewAccess && (
              <Button asChild variant="ghost">
                <Link href={`/organization/${org.id}/settings?page=Members`}>
                  <Users size={14} />
                </Link>
              </Button>
            )}
            {createProjectAccess ? (
              <Button asChild variant="secondary">
                <Link href={createProjectRoute(org.id)}>
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
                <CardTitle className="text-base">
                  {project.name}
                  {project.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID && (
                    <Badge variant="secondary" className="ml-2">
                      <TriangleAlert className="mr-2 h-3 w-3" />
                      Demo Project
                    </Badge>
                  )}
                </CardTitle>
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
  const organizations = api.organizations.all.useQuery();
  const [{ search }, setQueryParams] = useQueryParams({ search: StringParam });

  if (!organizations.data) {
    return "loading...";
  }

  return (
    <div className="md:container">
      {!queryOrgId && (
        <>
          <Header
            title="Home"
            actionButtons={
              <>
                <Input
                  className="w-56"
                  placeholder="Search projects"
                  onChange={(e) => setQueryParams({ search: e.target.value })}
                />
                <Button data-testid="create-project-btn" asChild>
                  <Link href="/setup">
                    <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    New Organization
                  </Link>
                </Button>
              </>
            }
          />
          <IntroducingOrganizations />
        </>
      )}
      {organizations.data.filter(
        (org) => org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID,
      ).length === 0 && <Onboarding />}
      {organizations.data
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
              org={org}
              search={search ?? undefined}
              level="h3"
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
      Organizations are a way to group projects and manage access to them. See
      changelog to learn more about this change.
    </AlertDescription>
  </Alert>
);

const Onboarding = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="create-new-project-title">
          Get Started
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p>
          Create an organization and first project to get started with Langfuse.
        </p>
      </CardContent>
      <CardFooter className="flex gap-4">
        <Button data-testid="create-project-btn" asChild>
          <Link href="/setup">Start Setup</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/support">
            <LifeBuoy className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Support
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};
