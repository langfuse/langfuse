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
import {
  useOrgProjectSwitchPaths,
  useQueryProjectOrOrganization,
} from "@/src/features/projects/hooks";
import { useSession } from "next-auth/react";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import Link from "next/link";
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
                className="text-primary -ml-3 flex h-5 items-center gap-1.5 py-0 pr-0 pl-3 text-sm leading-none"
                {...getTriggerProps()}
              >
                <span
                  // eslint-disable-next-line @repo/no-raw-font-weight -- switcher names use medium; semibold reads too heavy here
                  className="ph-no-capture font-medium"
                >
                  {organization?.name ?? "Organization"}
                </span>
                <DropdownIndicator direction="up-down" size="sm" />
              </button>
            )}
          </OrganizationDropdownMenu>
        )}
        {organization && project && (
          <>
            <BreadcrumbSeparator className="text-foreground-tertiary">
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
                  <span
                    // eslint-disable-next-line @repo/no-raw-font-weight -- switcher names use medium; semibold reads too heavy here
                    className="ph-no-capture font-medium"
                  >
                    {project.name}
                  </span>
                  <DropdownIndicator direction="up-down" size="sm" />
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
              <BreadcrumbSeparator className="text-foreground-tertiary">
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
