import Link from "next/link";
import type { CSSProperties } from "react";
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
  type PromptStage,
  getProjectPrimaryNav,
} from "./product-manifest";
import { type WorkspaceSelection, WorkspaceTree } from "./WorkspaceTree";

const PRODUCT_SIDEBAR_STYLE = {
  "--sidebar-background": "60 4% 95.1%",
  "--sidebar-accent": "60 4% 92.5%",
  "--sidebar-border": "60 4% 88%",
} as CSSProperties;

type ProductSidebarProps = {
  projectId: string;
  activeSection?: ProjectPrimarySection;
  workspaceSelection: WorkspaceSelection;
  activePromptStage?: PromptStage;
};

export function ProductSidebar({
  projectId,
  activeSection,
  workspaceSelection,
  activePromptStage,
}: ProductSidebarProps) {
  const primaryItems = getProjectPrimaryNav(projectId);

  return (
    <Sidebar collapsible="icon" variant="sidebar" style={PRODUCT_SIDEBAR_STYLE}>
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

        <WorkspaceTree
          projectId={projectId}
          selection={workspaceSelection}
          activePromptStage={activePromptStage}
        />

        <div className="flex-1" />
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border/70 border-t px-2 pt-2 pb-2 group-data-[collapsible=icon]:hidden" />
      <SidebarRail />
    </Sidebar>
  );
}
