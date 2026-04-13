import {
  BookOpen,
  LockIcon,
  MessageSquareText,
  PlusIcon,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { type User } from "next-auth";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import ContainerPage from "@/src/components/layouts/container-page";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Separator } from "@/src/components/ui/separator";
import { env } from "@/src/env.mjs";
import {
  createOrganizationRoute,
  createProjectRoute,
} from "@/src/features/setup/setupRoutes";

type Organization = User["organizations"][number];

export type OrganizationOverviewDisplayOrganization = Organization & {
  canCreateProject: boolean;
  canViewMembers: boolean;
  isDemoOrg: boolean;
};

type OrganizationOverviewViewProps = {
  organizations: OrganizationOverviewDisplayOrganization[];
  canCreateOrg: boolean;
  search: string;
  selectedOrganizationId?: string;
  onSearchChange: (value: string) => void;
};

const OrganizationProjectTiles = ({
  org,
  search,
}: {
  org: OrganizationOverviewDisplayOrganization;
  search?: string;
}) => {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {org.projects
        .filter(
          (project) =>
            !search ||
            project.name.toLowerCase().includes(search.toLowerCase()),
        )
        .map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <CardTitle className="truncate text-base">
                {project.name}
              </CardTitle>
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
          <Link href={`/project/${env.NEXT_PUBLIC_DEMO_PROJECT_ID}/traces`}>
            View Demo Project
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

const OrganizationActionButtons = ({
  orgId,
  canCreateProject,
  canViewMembers,
  primaryButtonVariant = "default",
}: {
  orgId: string;
  canCreateProject: boolean;
  canViewMembers: boolean;
  primaryButtonVariant?: "default" | "secondary";
}) => {
  return (
    <>
      <Button asChild variant="ghost">
        <Link href={`/organization/${orgId}/settings`}>
          <Settings size={14} />
        </Link>
      </Button>
      {canViewMembers && (
        <Button asChild variant="ghost">
          <Link href={`/organization/${orgId}/settings/members`}>
            <Users size={14} />
          </Link>
        </Button>
      )}
      {canCreateProject ? (
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
  org: OrganizationOverviewDisplayOrganization;
  search?: string;
}) => {
  if (org.isDemoOrg) {
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
        title: org.name ?? "Organization",
        actionButtonsRight: (
          <OrganizationActionButtons
            orgId={org.id}
            canCreateProject={org.canCreateProject}
            canViewMembers={org.canViewMembers}
          />
        ),
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
  org: OrganizationOverviewDisplayOrganization;
  search?: string;
}) => {
  if (org.isDemoOrg) {
    return (
      <div key={org.id}>
        <DemoOrganizationTile />
      </div>
    );
  }

  return (
    <div key={org.id} className="mb-10">
      <Header
        title={org.name}
        className="truncate"
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
            canCreateProject={org.canCreateProject}
            canViewMembers={org.canViewMembers}
            primaryButtonVariant="secondary"
          />
        }
      />
      <OrganizationProjectTiles org={org} search={search} />
    </div>
  );
};

export function OrganizationOverviewView({
  organizations,
  canCreateOrg,
  search,
  selectedOrganizationId,
  onSearchChange,
}: OrganizationOverviewViewProps) {
  const showOnboarding =
    organizations.filter((org) => !org.isDemoOrg).length === 0 &&
    !selectedOrganizationId;

  if (selectedOrganizationId) {
    const org = organizations.find(
      (organization) => organization.id === selectedOrganizationId,
    );

    if (!org) {
      return null;
    }

    return <SingleOrganizationPage org={org} search={search || undefined} />;
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
              value={search}
              placeholder="Search projects"
              onChange={(event) => onSearchChange(event.target.value)}
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
      {showOnboarding && <Onboarding canCreateOrgs={canCreateOrg} />}
      {[...organizations]
        .sort((a, b) => {
          if (a.isDemoOrg) return 1;
          if (b.isDemoOrg) return -1;
          return 0;
        })
        .map((org) => (
          <div key={org.id}>
            {org.isDemoOrg && <Separator />}
            <SingleOrganizationProjectOverviewTile
              org={org}
              search={search || undefined}
            />
          </div>
        ))}
    </ContainerPage>
  );
}

const Onboarding = ({ canCreateOrgs }: { canCreateOrgs: boolean }) => {
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
