/* eslint-disable @repo/no-style-props */
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "../ui/breadcrumb";
import { Fragment } from "react";
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
import { Badge } from "../ui/badge";
import { OrganizationDropdownMenu } from "../OrganizationDropdownMenu/OrganizationDropdownMenu";
import { ProjectDropdownMenu } from "../ProjectDropdownMenu/ProjectDropdownMenu";

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
          >
            {({ getTriggerProps }) => (
              <button
                type="button"
                className="text-primary flex h-5 items-center gap-1 p-0 text-sm leading-none"
                {...getTriggerProps()}
              >
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
              </button>
            )}
          </OrganizationDropdownMenu>
        )}
        {organization && project && (
          <>
            <BreadcrumbSeparator>
              <Slash />
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
                  className="text-primary flex h-5 items-center gap-1 p-0 leading-none"
                  {...getTriggerProps()}
                >
                  {project.name}
                  <ChevronDownIcon className="h-4 w-4" />
                </button>
              )}
            </ProjectDropdownMenu>
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
