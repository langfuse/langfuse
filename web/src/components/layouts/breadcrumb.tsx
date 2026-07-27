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

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {organization && (
          <DropdownMenu>
            <DropdownMenuTrigger className="text-primary flex items-center gap-1 text-sm">
              {organization?.name ?? "Organization"}
              {isCloudPlan(organization?.plan) &&
                organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID && (
                  <Badge
                    className="ml-1 px-1 py-0 text-xs font-normal"
                    variant="secondary"
                  >
                    {planLabels[organization.plan]}
                  </Badge>
                )}
              <ChevronDownIcon className="h-4 w-4" />
            </DropdownMenuTrigger>
            <OrganizationDropdownMenu
              {...(organizations
                ? { state: "loaded", organizations }
                : { state: "loading" })}
              canCreateOrganizations={!!canCreateOrganizations}
              getOrgPath={getOrgPath}
            />
          </DropdownMenu>
        )}
        {organization && project && (
          <>
            <BreadcrumbSeparator>
              <Slash />
            </BreadcrumbSeparator>
            <DropdownMenu>
              <DropdownMenuTrigger className="text-primary flex items-center gap-1">
                {project?.name ?? "Project"}
                <ChevronDownIcon className="h-4 w-4" />
              </DropdownMenuTrigger>
              <ProjectDropdownMenu
                organizationId={organization.id}
                {...(organizations
                  ? {
                      state: "loaded",
                      projects:
                        organizations.find((org) => org.id === organization.id)
                          ?.projects ?? [],
                    }
                  : { state: "loading" })}
                canCreateProjects={!!canCreateProjects}
                getProjectPath={getProjectPath}
              />
            </DropdownMenu>
          </>
        )}
        {items?.map((item, index) => (
          <Fragment key={index}>
            <BreadcrumbSeparator>
              <Slash />
            </BreadcrumbSeparator>
            <BreadcrumbItem key={index}>
              {item.href ? (
                <BreadcrumbLink asChild>
                  <Link href={item.href}>{item.name}</Link>
                </BreadcrumbLink>
              ) : (
                <span>{item.name}</span>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default BreadcrumbComponent;
