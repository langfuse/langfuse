import { useSession } from "next-auth/react";
import { Building2, Settings, Users } from "lucide-react";
import {
  Card,
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

export const OrganizationProjectOverview = ({ orgId }: { orgId?: string }) => {
  const session = useSession();
  const organizations = session.data?.user?.organizations ?? [];
  const [{ search }, setQueryParams] = useQueryParams({ search: StringParam });

  return (
    <div className="md:container">
      {!orgId && (
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
      {organizations
        .filter((org) => orgId === undefined || org.id === orgId)
        .map((org) => (
          <div key={org.id} className="mb-10">
            <Header
              title={org.name}
              level={orgId ? "h2" : "h3"}
              actionButtons={
                <>
                  {orgId && (
                    <Input
                      className="w-56"
                      placeholder="Search projects"
                      onChange={(e) =>
                        setQueryParams({ search: e.target.value })
                      }
                    />
                  )}
                  <Button asChild variant="ghost">
                    <Link href={`/organization/${org.id}/settings`}>
                      <Settings size={14} />
                    </Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link
                      href={`/organization/${org.id}/settings?page=Members`}
                    >
                      <Users size={14} />
                    </Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href={createProjectRoute(org.id)}>
                      <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                      New project
                    </Link>
                  </Button>
                </>
              }
            />
            {orgId && <IntroducingOrganizations />}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {org.projects
                .filter(
                  (p) =>
                    !search ||
                    p.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((project) => (
                  <Card key={project.id}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {project.name}
                      </CardTitle>
                    </CardHeader>
                    <CardFooter className="gap-2">
                      <Button asChild variant="secondary">
                        <Link href={`/project/${project.id}`}>
                          Go to project
                        </Link>
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
