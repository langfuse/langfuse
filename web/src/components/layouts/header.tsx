import Link from "next/link";
import DocPopup from "@/src/components/layouts/doc-popup";
import { type Status, StatusBadge } from "./status-badge";
import { cn } from "@/src/utils/tailwind";
import { Badge } from "@/src/components/ui/badge";
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  ChevronDownIcon,
  LoaderCircle,
  PlusIcon,
  Settings,
  Slash,
} from "lucide-react";
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

export default function Header({
  level = "h2",
  ...props
}: {
  title: string;
  breadcrumb?: { name: string; href?: string }[];
  status?: Status;
  label?: {
    text: string;
    href: string;
  };
  help?: { description: string; href?: string };
  featureBetaURL?: string;
  actionButtons?: React.ReactNode;
  level?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn(level === "h2" ? "mb-4" : "mb-2", props.className)}>
      <div>
        {level === "h2" ? (
          <BreadcrumbComponent items={props.breadcrumb} />
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="flex min-w-0 flex-row justify-center align-middle">
            {level === "h2" ? (
              <h2 className="text-3xl font-bold leading-7 sm:tracking-tight">
                {props.title}
              </h2>
            ) : (
              <h3 className="text-xl font-bold leading-7 sm:tracking-tight">
                {props.title}
              </h3>
            )}
            {props.help ? (
              <DocPopup
                description={props.help.description}
                href={props.help.href}
              />
            ) : null}
            {props.featureBetaURL ? (
              <Link
                href={props.featureBetaURL}
                rel="noopener noreferrer"
                target="_blank"
                className="flex items-center"
              >
                <Badge
                  title="Feature is currently in beta. Click to learn more."
                  className="ml-2"
                >
                  Beta
                </Badge>
              </Link>
            ) : null}
          </div>
          {props.status && <StatusBadge type={props.status} />}
          {props.label && (
            <Link href={props.label.href}>
              <StatusBadge type={props.label.text} />
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {props.actionButtons ?? null}
        </div>
      </div>
    </div>
  );
}

const LoadingMenuItem = () => (
  <DropdownMenuItem>
    <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> Loading...
  </DropdownMenuItem>
);

const BreadcrumbComponent = ({
  items,
}: {
  items?: { name: string; href?: string }[];
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

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {organization && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 text-sm text-primary">
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
            <DropdownMenuContent align="start">
              <DropdownMenuItem className="font-semibold" asChild>
                <Link href="/" className="cursor-pointer">
                  Organizations
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="max-h-36 overflow-y-auto">
                {organizations ? (
                  organizations
                    .sort((a, b) => {
                      // sort demo org to the bottom
                      const isDemoA = env.NEXT_PUBLIC_DEMO_ORG_ID === a.id;
                      const isDemoB = env.NEXT_PUBLIC_DEMO_ORG_ID === b.id;
                      if (isDemoA) return 1;
                      if (isDemoB) return -1;
                      return 0;
                    })
                    .map((dropdownOrg) => (
                      <Fragment key={dropdownOrg.id}>
                        {env.NEXT_PUBLIC_DEMO_ORG_ID === dropdownOrg.id && (
                          <DropdownMenuSeparator />
                        )}
                        <DropdownMenuItem asChild>
                          <Link
                            href={getOrgPath(dropdownOrg.id)}
                            className="flex cursor-pointer justify-between"
                          >
                            <span
                              className="max-w-36 overflow-hidden overflow-ellipsis whitespace-nowrap"
                              title={dropdownOrg.name}
                            >
                              {dropdownOrg.name}
                            </span>
                            <Button
                              asChild
                              variant="ghost"
                              size="xs"
                              className="-my-1 ml-4 hover:bg-background"
                            >
                              <div
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(
                                    `/organization/${dropdownOrg.id}/settings`,
                                  );
                                }}
                              >
                                <Settings size={12} />
                              </div>
                            </Button>
                          </Link>
                        </DropdownMenuItem>
                      </Fragment>
                    ))
                ) : (
                  <LoadingMenuItem />
                )}
              </div>

              {canCreateOrganizations && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-8 w-full text-sm font-normal"
                      asChild
                    >
                      <Link href={createOrganizationRoute}>
                        <PlusIcon
                          className="mr-1.5 h-4 w-4"
                          aria-hidden="true"
                        />
                        New Organization
                      </Link>
                    </Button>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {organization && project && (
          <>
            <BreadcrumbSeparator>
              <Slash />
            </BreadcrumbSeparator>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 text-primary">
                {project?.name ?? "Project"}
                <ChevronDownIcon className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild className="font-semibold">
                  <Link
                    href={`/organization/${organization.id}`}
                    className="cursor-pointer"
                  >
                    Projects
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="max-h-36 overflow-y-auto">
                  {organizations ? (
                    organizations
                      .find((org) => org.id === organization.id)
                      ?.projects.map((dropdownProject) => (
                        <DropdownMenuItem key={dropdownProject.id} asChild>
                          <Link
                            href={getProjectPath(dropdownProject.id)}
                            className="flex cursor-pointer justify-between"
                          >
                            <span
                              className="max-w-36 overflow-hidden overflow-ellipsis whitespace-nowrap"
                              title={dropdownProject.name}
                            >
                              {dropdownProject.name}
                            </span>
                            <Button
                              asChild
                              variant="ghost"
                              size="xs"
                              className="-my-1 ml-4 hover:bg-background"
                            >
                              <div
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(
                                    `/project/${dropdownProject.id}/settings`,
                                  );
                                }}
                              >
                                <Settings size={12} />
                              </div>
                            </Button>
                          </Link>
                        </DropdownMenuItem>
                      ))
                  ) : (
                    <LoadingMenuItem />
                  )}
                </div>

                {canCreateProjects && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-8 w-full text-sm font-normal"
                        asChild
                      >
                        <Link href={createProjectRoute(organization.id)}>
                          <PlusIcon
                            className="mr-1.5 h-4 w-4"
                            aria-hidden="true"
                          />
                          New Project
                        </Link>
                      </Button>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
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
