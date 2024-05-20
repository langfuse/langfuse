import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import Link from "next/link";
import Header from "@/src/components/layouts/header";
import { useSession } from "next-auth/react";
import { Settings } from "lucide-react";
import { NewProjectButton } from "@/src/features/projects/components/NewProjectButton";

export const OrganizationProjectOverview = ({ orgId }: { orgId?: string }) => {
  const session = useSession();
  const organizations = session.data?.user?.organizations ?? [];

  return (
    <>
      {organizations
        .filter((org) => orgId === undefined || org.id === orgId)
        .map((org) => (
          <div key={org.id} className="mb-10">
            <Header
              title={org.name}
              level={orgId ? "h2" : "h3"}
              actionButtons={
                <>
                  <Button asChild variant="secondary">
                    <Link href={`/organization/${org.id}/settings`}>
                      <Settings size={14} />
                    </Link>
                  </Button>
                  <NewProjectButton orgId={org.id} />
                </>
              }
            />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {org.projects.map((project) => (
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
        ))}
    </>
  );
};
