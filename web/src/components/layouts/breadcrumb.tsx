/* eslint-disable @repo/no-style-props, @repo/component-file-structure */
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { Fragment } from "react";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { env } from "@/src/env.mjs";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import {
  useOrgProjectSwitchPaths,
  useQueryProjectOrOrganization,
} from "@/src/features/projects/hooks";
import { useSession } from "next-auth/react";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import Link from "next/link";
import { cn } from "@/src/utils/tailwind";
import { useOptionalSidebar } from "@/src/components/ui/sidebar";
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
  // The expanded desktop sidebar shows the org switcher, so the breadcrumb
  // drops it there.
  const orgInSidebar = useOptionalSidebar()?.state === "expanded";

  const canCreateOrganizations = session.data?.user?.canCreateOrganizations;
  const canCreateProjects = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "projects:create",
  });

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {organization && (
          <OrganizationDropdownMenu
            {...(organizations
              ? { state: "loaded", organizations }
              : { state: "loading" })}
            canCreateOrganizations={!!canCreateOrganizations}
            getOrgPath={getOrgPath}
            currentOrganizationId={organization.id}
          >
            {({ getTriggerProps }) => (
              <button
                type="button"
                className={cn(
                  "text-primary -ml-3 flex h-5 items-center gap-1.5 py-0 pr-0 pl-3 text-sm leading-none",
                  orgInSidebar && "md:hidden",
                )}
                {...getTriggerProps()}
              >
                <span className="ph-no-capture font-medium">
                  {organization?.name ?? "Organization"}
                </span>
                {isCloudPlan(organization.plan) &&
                  organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID && (
                    <Badge
                      color="filled"
                      size="sm"
                      text={planLabels[organization.plan].toUpperCase()}
                    />
                  )}
                <DropdownIndicator
                  direction="up-down"
                  size="sm"
                  color="muted"
                />
              </button>
            )}
          </OrganizationDropdownMenu>
        )}
        {organization && project && (
          <>
            <BreadcrumbSeparator
              className={cn(
                "text-foreground-tertiary",
                orgInSidebar && "md:hidden",
              )}
            >
              /
            </BreadcrumbSeparator>
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
              currentProjectId={project.id}
            >
              {({ getTriggerProps }) => (
                <button
                  type="button"
                  className="text-primary -ml-3 flex h-5 items-center gap-1.5 py-0 pr-0 pl-3 leading-none"
                  {...getTriggerProps()}
                >
                  <span className="ph-no-capture font-medium">
                    {project.name}
                  </span>
                  <DropdownIndicator
                    direction="up-down"
                    size="sm"
                    color="muted"
                  />
                </button>
              )}
            </ProjectDropdownMenu>
          </>
        )}
        {items?.map((item, index) => {
          const isCurrentPage = index === items.length - 1;
          const name = item.href ? (
            <Link href={item.href}>{item.name}</Link>
          ) : (
            item.name
          );
          return (
            <Fragment key={index}>
              <BreadcrumbSeparator
                className={cn(
                  "text-foreground-tertiary",
                  index === 0 &&
                    organization &&
                    !project &&
                    orgInSidebar &&
                    "md:hidden",
                )}
              >
                /
              </BreadcrumbSeparator>
              <BreadcrumbItem key={index}>
                {isCurrentPage && <BreadcrumbPage>{name}</BreadcrumbPage>}
                {!isCurrentPage && item.href && (
                  <BreadcrumbLink asChild>{name}</BreadcrumbLink>
                )}
                {!isCurrentPage && !item.href && <span>{name}</span>}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default BreadcrumbComponent;
