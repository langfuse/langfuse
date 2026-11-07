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
import { env } from "@/src/env.mjs";
import {
  useOrgProjectSwitchPaths,
  useQueryProjectOrOrganization,
} from "@/src/features/projects/hooks";
import { useSession } from "next-auth/react";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import Link from "next/link";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { OrganizationDropdownMenu } from "@/src/components/OrganizationDropdownMenu/OrganizationDropdownMenu";
import { ProjectDropdownMenu } from "@/src/components/ProjectDropdownMenu/ProjectDropdownMenu";
import { useRouter } from "next/router";
import { Waypoints } from "@langfuse/icons";
import { gatewayPageSlugFromPath } from "@/src/features/ai-gateway/fns/gatewayUrls/gatewayPageSlugFromPath";

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
  const router = useRouter();
  const showGatewayLabel =
    !!organization && gatewayPageSlugFromPath(router.asPath) !== null;

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
          >
            {({ getTriggerProps }) => (
              <button
                type="button"
                className="text-primary flex h-5 items-center gap-1.5 p-0 text-sm leading-none"
                {...getTriggerProps()}
              >
                <span className="ph-no-capture">
                  {organization?.name ?? "Organization"}
                </span>
                {isCloudPlan(organization?.plan) &&
                  organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID && (
                    <Badge
                      color="filled"
                      size="sm"
                      text={planLabels[organization.plan]}
                    />
                  )}
                <DropdownIndicator size="sm" nudge />
              </button>
            )}
          </OrganizationDropdownMenu>
        )}
        {organization && (project || showGatewayLabel) && (
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
            >
              {({ getTriggerProps }) => (
                <button
                  type="button"
                  className="text-primary flex h-5 items-center gap-1.5 p-0 leading-none"
                  {...getTriggerProps()}
                >
                  {project ? (
                    <span className="ph-no-capture">{project.name}</span>
                  ) : (
                    <>
                      <Waypoints size="base" aria-hidden />
                      AI Gateway
                    </>
                  )}
                  <DropdownIndicator size="sm" nudge />
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
