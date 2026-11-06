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
import { useRouter } from "next/router";
import { Waypoints } from "@langfuse/icons";
import { gatewayPageSlugFromPath } from "@/src/features/ai-gateway/fns/gatewayUrls/gatewayPageSlugFromPath";
import { cn } from "@/src/utils/tailwind";
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
  const { getProjectPath } = useOrgProjectSwitchPaths();
  const router = useRouter();
  const isGatewayPage = gatewayPageSlugFromPath(router.asPath) !== null;

  const organizations = session.data?.user?.organizations;

  const canCreateProjects = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "projects:create",
  });

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {organization && (
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
          >
            {({ getTriggerProps }) => (
              <button
                type="button"
                className={cn(
                  "flex h-5 items-center gap-1.5 p-0 leading-5",
                  project || isGatewayPage
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
                {...getTriggerProps()}
              >
                {isGatewayPage && <Waypoints size="base" aria-hidden />}
                <span className={cn(project && "ph-no-capture")}>
                  {project?.name ??
                    (isGatewayPage ? "AI Gateway" : "Select project")}
                </span>
                <DropdownIndicator
                  direction={project ? "down" : "up-down"}
                  size="sm"
                />
              </button>
            )}
          </ProjectDropdownMenu>
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
