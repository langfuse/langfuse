import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/src/components/ui/sidebar";
import { AgentationSurface } from "@/src/features/agentation/components/AgentationSurface";
import { cn } from "@/src/utils/tailwind";
import { type ShellBreadcrumbItem } from "./Breadcrumbs";
import { ProductHeader } from "./Header";
import {
  type ProjectPrimarySection,
  type PromptStage,
} from "./product-manifest";
import { type PromptStageTab } from "./PromptStageTabs";
import { ProductSidebar } from "./Sidebar";
import { type WorkspaceSelection } from "./WorkspaceTree";

type ProductAppShellProps = {
  scope: "organization" | "project";
  organizationId?: string;
  projectId?: string;
  activeSection?: ProjectPrimarySection | "organization";
  className?: string;
  title: string;
  titleContent?: ReactNode;
  breadcrumbs: ShellBreadcrumbItem[];
  children: ReactNode;
  workspaceSelection?: WorkspaceSelection;
  promptTabs?: PromptStageTab[];
  activePromptStage?: PromptStage;
};

export function ProductAppShell({
  scope,
  organizationId,
  projectId,
  activeSection,
  className,
  title,
  titleContent,
  breadcrumbs,
  children,
  workspaceSelection = null,
  promptTabs,
  activePromptStage,
}: ProductAppShellProps) {
  return (
    <SidebarProvider>
      <div className={cn("bg-background flex h-dvh w-full", className)}>
        <ProductSidebar
          scope={scope}
          organizationId={organizationId}
          projectId={projectId}
          activeSection={activeSection}
          workspaceSelection={workspaceSelection}
        />
        <SidebarInset className="max-w-full md:peer-data-[state=collapsed]:w-[calc(100vw-var(--sidebar-width-icon))] md:peer-data-[state=expanded]:w-[calc(100vw-var(--sidebar-width))]">
          <div className="flex h-full min-h-0 flex-1 flex-col">
            <ProductHeader
              title={title}
              titleContent={titleContent}
              breadcrumbs={breadcrumbs}
              promptTabs={promptTabs}
              activePromptStage={activePromptStage}
            />
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
            <AgentationSurface />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
