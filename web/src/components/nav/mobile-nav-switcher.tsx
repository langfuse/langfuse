import { ChevronDownIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/src/components/ui/sidebar";
import { OrganizationDropdownMenu } from "@/src/components/OrganizationDropdownMenu/OrganizationDropdownMenu";
import { ProjectDropdownMenu } from "@/src/components/ProjectDropdownMenu/ProjectDropdownMenu";
import {
  useOrgProjectSwitchPaths,
  useQueryProjectOrOrganization,
} from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

/**
 * Org + project switcher for the TOP of the mobile nav drawer.
 *
 * The mobile drawer (the `Sheet` branch of `Sidebar`, see ui/sidebar.tsx)
 * otherwise only lists section links — the same switching affordance the
 * desktop breadcrumb offers (`BreadcrumbComponent`) is easy to miss on
 * mobile, since the breadcrumb sits in the page body. This reuses the exact
 * dropdown menus and path builders the breadcrumb uses, so switching
 * behavior is identical between both entry points; only rendered by
 * `AppSidebar` when `useSidebar().isMobile` is true.
 */
export function MobileNavSwitcher() {
  const session = useSession();
  const { organization, project } = useQueryProjectOrOrganization();
  const { getProjectPath, getOrgPath } = useOrgProjectSwitchPaths();

  const organizations = session.data?.user?.organizations;
  const canCreateOrganizations = session.data?.user?.canCreateOrganizations;
  const canCreateProjects = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "projects:create",
  });

  if (!organization) return null;

  return (
    <SidebarGroup className="border-b">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <span
                    className="min-w-0 flex-1 truncate text-left"
                    title={organization.name}
                  >
                    {organization.name}
                  </span>
                  <ChevronDownIcon className="ml-auto h-4 w-4 shrink-0" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <OrganizationDropdownMenu
                {...(organizations
                  ? { state: "loaded", organizations }
                  : { state: "loading" })}
                canCreateOrganizations={!!canCreateOrganizations}
                getOrgPath={getOrgPath}
              />
            </DropdownMenu>
          </SidebarMenuItem>
          {project && (
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton>
                    <span
                      className="min-w-0 flex-1 truncate text-left"
                      title={project.name}
                    >
                      {project.name}
                    </span>
                    <ChevronDownIcon className="ml-auto h-4 w-4 shrink-0" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <ProjectDropdownMenu
                  organizationId={organization.id}
                  {...(organizations
                    ? {
                        state: "loaded",
                        projects:
                          organizations.find(
                            (org) => org.id === organization.id,
                          )?.projects ?? [],
                      }
                    : { state: "loading" })}
                  canCreateProjects={!!canCreateProjects}
                  getProjectPath={getProjectPath}
                />
              </DropdownMenu>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
