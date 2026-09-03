/* eslint-disable @repo/no-style-props */
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { Fragment } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { ChevronDownIcon, Slash } from "lucide-react";
import { env } from "@/src/env.mjs";
import {
  useOrgProjectSwitchPaths,
  useQueryProjectOrOrganization,
} from "@/src/features/projects/hooks";
import { useSession } from "next-auth/react";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import Link from "next/link";
import { Badge } from "@/src/components/ui/badge";
import { OrganizationDropdownMenu } from "@/src/components/OrganizationDropdownMenu/OrganizationDropdownMenu";
import { ProjectDropdownMenu } from "@/src/components/ProjectDropdownMenu/ProjectDropdownMenu";
import { cn } from "@/src/utils/tailwind";

const BreadcrumbComponent = ({
  items,
  className,
}: {
  items?: { name: string; href?: string }[];
  className?: string;
}) => {
  const session = useSession();
  const { organization, project } = useQueryProjectOrOrganization();
  const { getProjectPath, getOrgPath } = useOrgProjectSwitchPaths();

  const organizations = session.data?.user?.organizations;

  const canCreateOrganizations = session.data?.user?.canCreateOrganizations;
  const canCreateProjects = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "projects:create",
  });

  const orgName = organization?.name ?? "Organization";
  const projectName = project?.name ?? "Project";

  return (
    <Breadcrumb className={cn("max-w-full min-w-0", className)}>
      <BreadcrumbList className="min-w-0 justify-start">
        {organization && (
          <BreadcrumbItem className="min-w-0">
            <DropdownMenu>
              <DropdownMenuTrigger className="text-primary flex h-5 max-w-full min-w-0 items-center gap-1 overflow-hidden p-0 text-sm leading-none">
                <span className="truncate" title={orgName}>
                  {orgName}
                </span>
                {isCloudPlan(organization?.plan) &&
                  organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID && (
                    <Badge
                      className="ml-1 px-1 py-0 text-xs font-normal @max-[42rem]/pageheader:hidden"
                      variant="secondary"
                    >
                      {planLabels[organization.plan]}
                    </Badge>
                  )}
                <ChevronDownIcon className="h-4 w-4 shrink-0" />
              </DropdownMenuTrigger>
              <OrganizationDropdownMenu
                {...(organizations
                  ? { state: "loaded", organizations }
                  : { state: "loading" })}
                canCreateOrganizations={!!canCreateOrganizations}
                getOrgPath={getOrgPath}
              />
            </DropdownMenu>
          </BreadcrumbItem>
        )}
        {organization && project && (
          <>
            <BreadcrumbSeparator className="shrink-0">
              <Slash />
            </BreadcrumbSeparator>
            <BreadcrumbItem className="min-w-0">
              <DropdownMenu>
                <DropdownMenuTrigger className="text-primary flex h-5 max-w-full min-w-0 items-center gap-1 overflow-hidden p-0 leading-none">
                  <span className="truncate" title={projectName}>
                    {projectName}
                  </span>
                  <ChevronDownIcon className="h-4 w-4 shrink-0" />
                </DropdownMenuTrigger>
                <ProjectDropdownMenu
                  organizationId={organization.id}
                  {...(organizations
                    ? {
                        state: "loaded",
                        projects:
                          organizations.find(
                            (org) => org.id === organization.id,
                          )?.projects ?? [],
                      }
                    : { state: "loading" })}
                  canCreateProjects={!!canCreateProjects}
                  getProjectPath={getProjectPath}
                />
              </DropdownMenu>
            </BreadcrumbItem>
          </>
        )}
        {items?.map((item, index) => (
          <Fragment key={index}>
            <BreadcrumbSeparator className="shrink-0">
              <Slash />
            </BreadcrumbSeparator>
            <BreadcrumbItem className="min-w-0">
              {item.href ? (
                <BreadcrumbLink asChild>
                  <Link className="truncate" href={item.href} title={item.name}>
                    {item.name}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <span className="truncate" title={item.name}>
                  {item.name}
                </span>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default BreadcrumbComponent;
