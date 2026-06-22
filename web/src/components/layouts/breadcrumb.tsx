import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { Fragment } from "react";
import { ChevronDownIcon, PlusIcon, Slash } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { env } from "@/src/env.mjs";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createOrganizationRoute,
  createProjectRoute,
} from "@/src/features/setup/setupRoutes";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import Link from "next/link";
import { Badge } from "@/src/components/ui/badge";
import {
  SwitcherMenu,
  type SwitcherItem,
} from "@/src/components/layouts/SwitcherMenu";

const BreadcrumbComponent = ({
  items,
  className,
}: {
  items?: { name: string; href?: string }[];
  className?: string;
}) => {
  const router = useRouter();
  const session = useSession();
  const { organization, project } = useQueryProjectOrOrganization();

  const organizations = session.data?.user?.organizations;

  const canCreateOrganizations = session.data?.user?.canCreateOrganizations;
  const canCreateProjects = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "projects:create",
  });

  /**
   * Truncate the path before the first dynamic segment that is not allowlisted.
   * e.g. /project/[projectId]/traces/[traceId] -> /project/[projectId]/traces
   */
  const truncatePathBeforeDynamicSegments = (path: string) => {
    const allowlistedIds = ["[projectId]", "[organizationId]", "[page]"];
    const segments = router.route.split("/");
    const idSegments = segments.filter(
      (segment) => segment.startsWith("[") && segment.endsWith("]"),
    );
    const stopSegment = idSegments.filter((id) => !allowlistedIds.includes(id));
    if (stopSegment.length === 0) return path;
    const stopIndex = segments.indexOf(stopSegment[0]);
    const truncatedPath = path.split("/").slice(0, stopIndex).join("/");
    return truncatedPath;
  };

  const getProjectPath = (projectId: string) =>
    router.query.projectId
      ? truncatePathBeforeDynamicSegments(router.asPath).replace(
          router.query.projectId as string,
          projectId,
        )
      : `/project/${projectId}`;

  const getOrgPath = (orgId: string) =>
    router.query.organizationId
      ? truncatePathBeforeDynamicSegments(router.asPath).replace(
          router.query.organizationId as string,
          orgId,
        )
      : `/organization/${orgId}`;

  // Sort demo org to the bottom, then map to switcher items.
  const orgItems: SwitcherItem[] | undefined = organizations
    ? [...organizations]
        .sort((a, b) => {
          const isDemoA = env.NEXT_PUBLIC_DEMO_ORG_ID === a.id;
          const isDemoB = env.NEXT_PUBLIC_DEMO_ORG_ID === b.id;
          if (isDemoA) return 1;
          if (isDemoB) return -1;
          return 0;
        })
        .map((o) => ({
          id: o.id,
          name: o.name,
          href: getOrgPath(o.id),
          settingsHref: `/organization/${o.id}/settings`,
        }))
    : undefined;

  const projectItems: SwitcherItem[] | undefined = organizations
    ? (
        organizations.find((o) => o.id === organization?.id)?.projects ?? []
      ).map((p) => ({
        id: p.id,
        name: p.name,
        href: getProjectPath(p.id),
        settingsHref: `/project/${p.id}/settings`,
      }))
    : undefined;

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {organization && (
          <SwitcherMenu
            trigger={
              <>
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
              </>
            }
            triggerClassName="text-sm"
            headerLink={{ label: "Organizations", href: "/" }}
            items={orgItems}
            searchPlaceholder="Search organizations..."
            emptyText="No organization found."
            separatorBeforeId={env.NEXT_PUBLIC_DEMO_ORG_ID}
            footer={
              canCreateOrganizations ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-8 w-full text-sm font-normal"
                  asChild
                >
                  <Link href={createOrganizationRoute}>
                    <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    New Organization
                  </Link>
                </Button>
              ) : undefined
            }
          />
        )}
        {organization && project && (
          <>
            <BreadcrumbSeparator>
              <Slash />
            </BreadcrumbSeparator>
            <SwitcherMenu
              trigger={
                <>
                  {project?.name ?? "Project"}
                  <ChevronDownIcon className="h-4 w-4" />
                </>
              }
              headerLink={{
                label: "Projects",
                href: `/organization/${organization.id}`,
              }}
              items={projectItems}
              searchPlaceholder="Search projects..."
              emptyText="No project found."
              footer={
                canCreateProjects ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-8 w-full text-sm font-normal"
                    asChild
                  >
                    <Link href={createProjectRoute(organization.id)}>
                      <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      New Project
                    </Link>
                  </Button>
                ) : undefined
              }
            />
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
