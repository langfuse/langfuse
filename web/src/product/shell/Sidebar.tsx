import Link from "next/link";
import { LangfuseLogo } from "@/src/components/LangfuseLogo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/src/components/ui/sidebar";
import {
  type ProjectPrimarySection,
  getOrganizationPrimaryNav,
  getOrganizationUtilityNav,
  getProjectPrimaryNav,
  getProjectUtilityNav,
} from "./product-manifest";
import { type WorkspaceSelection, WorkspaceTree } from "./WorkspaceTree";

type ProductSidebarProps = {
  scope: "organization" | "project";
  organizationId?: string;
  projectId?: string;
  activeSection?: ProjectPrimarySection | "organization";
  workspaceSelection: WorkspaceSelection;
};

export function ProductSidebar({
  scope,
  organizationId,
  projectId,
  activeSection,
  workspaceSelection,
}: ProductSidebarProps) {
  const primaryItems =
    scope === "organization" && organizationId
      ? getOrganizationPrimaryNav(organizationId)
      : projectId
        ? getProjectPrimaryNav(projectId)
        : [];
  const utilityItems =
    scope === "organization" && organizationId
      ? getOrganizationUtilityNav(organizationId)
      : projectId
        ? getProjectUtilityNav(projectId)
        : [];

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-sidebar-border/70 border-b">
        <div className="flex min-h-9 items-center gap-2 py-3 pr-0 pl-3 group-data-[collapsible=icon]:p-3">
          <LangfuseLogo version />
        </div>
      </SidebarHeader>
      <SidebarContent className="pb-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={item.section === activeSection}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {scope === "project" && projectId ? (
          <WorkspaceTree projectId={projectId} selection={workspaceSelection} />
        ) : null}

        <div className="flex-1" />

        <SidebarGroup className="border-sidebar-border/70 mt-2 border-t pt-2">
          <SidebarGroupContent>
            <SidebarMenu>
              {utilityItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border/70 border-t px-2 pt-2 pb-2 group-data-[collapsible=icon]:hidden">
        <div className="bg-muted/30 rounded-2xl border p-3">
          <p className="text-sm font-medium">Preview shell</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Structure first. Feature content comes later.
          </p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
