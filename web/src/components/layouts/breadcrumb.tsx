import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { Fragment, type ReactNode, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import { ChevronDownIcon, PlusIcon, Settings, Slash } from "lucide-react";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
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
import { cn } from "@/src/utils/tailwind";

type SwitcherItem = {
  id: string;
  name: string;
  href: string;
  settingsHref: string;
};

/**
 * A searchable switcher dropdown (org or project) rendered as a Popover + cmdk
 * Command. The header link and footer action live outside the CommandList so
 * they are never filtered out by the search. `items === undefined` means the
 * session is still loading.
 */
const SwitcherMenu = ({
  trigger,
  triggerClassName,
  headerLink,
  items,
  searchPlaceholder,
  emptyText,
  separatorBeforeId,
  footer,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  headerLink: { label: string; href: string };
  items: SwitcherItem[] | undefined;
  searchPlaceholder: string;
  emptyText: string;
  separatorBeforeId?: string;
  footer?: ReactNode;
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn("text-primary flex items-center gap-1", triggerClassName)}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <Link
            href={headerLink.href}
            className="block px-3 py-2 text-sm font-semibold hover:underline"
            onClick={() => setOpen(false)}
          >
            {headerLink.label}
          </Link>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            {items === undefined ? (
              <div className="text-muted-foreground flex items-center px-3 py-2 text-sm">
                <span className="mr-1.5 inline-flex">
                  <Spinner size="sm" />
                </span>
                Loading...
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyText}</CommandEmpty>
                <CommandGroup>
                  {items.map((item) => (
                    <Fragment key={item.id}>
                      {separatorBeforeId === item.id && <CommandSeparator />}
                      <CommandItem
                        value={`${item.name} ${item.id}`}
                        onSelect={() => navigate(item.href)}
                        className="flex cursor-pointer justify-between gap-2"
                      >
                        <span
                          className="overflow-hidden text-ellipsis whitespace-nowrap"
                          title={item.name}
                        >
                          {item.name}
                        </span>
                        <Button
                          asChild
                          variant="ghost"
                          size="xs"
                          className="hover:bg-background -my-1 ml-4"
                        >
                          <div
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigate(item.settingsHref);
                            }}
                          >
                            <Settings size={12} />
                          </div>
                        </Button>
                      </CommandItem>
                    </Fragment>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          {footer ? (
            <>
              <CommandSeparator />
              <div className="p-1">{footer}</div>
            </>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

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
