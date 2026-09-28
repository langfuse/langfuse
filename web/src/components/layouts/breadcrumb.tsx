/* eslint-disable @repo/no-style-props */
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { Fragment, useState } from "react";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Popover, PopoverTrigger } from "@/src/components/ui/popover";
import { env } from "@/src/env.mjs";
import {
  useOrgProjectSwitchPaths,
  useQueryProjectOrOrganization,
} from "@/src/features/projects";
import { useSession } from "next-auth/react";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import {
  createOrganizationRoute,
  createProjectRoute,
} from "@/src/features/setup";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import Link from "next/link";
import { Badge } from "@/src/components/ui/badge";
import SwitcherMenuContent, {
  type SwitcherItem,
} from "@/src/components/layouts/switcher-menu";

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
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);

  const organizations = session.data?.user?.organizations;

  const canCreateOrganizations = session.data?.user?.canCreateOrganizations;
  const canCreateProjects = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "projects:create",
  });

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
          <Popover open={orgSwitcherOpen} onOpenChange={setOrgSwitcherOpen}>
            <PopoverTrigger className="text-primary flex h-5 items-center gap-1 p-0 text-sm leading-none">
              {organization?.name ?? "Organization"}
              {isCloudPlan(organization?.plan) &&
                organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID && (
                  <Badge className="ml-1" variant="secondary">
                    {planLabels[organization.plan]}
                  </Badge>
                )}
              <ChevronDownIcon className="text-foreground-tertiary size-3 translate-y-px" />
            </PopoverTrigger>
            <SwitcherMenuContent
              onClose={() => setOrgSwitcherOpen(false)}
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
                    <Link
                      href={createOrganizationRoute}
                      onClick={() => setOrgSwitcherOpen(false)}
                    >
                      <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      New Organization
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </Popover>
        )}
        {organization && project && (
          <>
            <BreadcrumbSeparator className="text-foreground-tertiary">
              /
            </BreadcrumbSeparator>
            <Popover
              open={projectSwitcherOpen}
              onOpenChange={setProjectSwitcherOpen}
            >
              <PopoverTrigger className="text-primary flex h-5 items-center gap-1 p-0 leading-none">
                {project?.name ?? "Project"}
                <ChevronDownIcon className="text-foreground-tertiary size-3 translate-y-px" />
              </PopoverTrigger>
              <SwitcherMenuContent
                onClose={() => setProjectSwitcherOpen(false)}
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
                      <Link
                        href={createProjectRoute(organization.id)}
                        onClick={() => setProjectSwitcherOpen(false)}
                      >
                        <PlusIcon
                          className="mr-1.5 h-4 w-4"
                          aria-hidden="true"
                        />
                        New Project
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            </Popover>
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
