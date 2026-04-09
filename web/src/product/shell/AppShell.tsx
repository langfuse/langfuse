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
import { ProductSidebar } from "./Sidebar";
import { type WorkspaceSelection } from "./WorkspaceTree";

type ProductAppShellProps = {
  projectId: string;
  activeSection?: ProjectPrimarySection;
  className?: string;
  showHeader?: boolean;
  headerClassName?: string;
  mainClassName?: string;
  breadcrumbs: ShellBreadcrumbItem[];
  children: ReactNode;
  workspaceSelection?: WorkspaceSelection;
  activePromptStage?: PromptStage;
};

export function ProductAppShell({
  projectId,
  activeSection,
  className,
  showHeader = true,
  headerClassName,
  mainClassName,
  breadcrumbs,
  children,
  workspaceSelection = null,
  activePromptStage,
}: ProductAppShellProps) {
  return (
    <SidebarProvider>
      <div className={cn("bg-background flex h-dvh w-full", className)}>
        <ProductSidebar
          projectId={projectId}
          activeSection={activeSection}
          workspaceSelection={workspaceSelection}
          activePromptStage={activePromptStage}
        />
        <SidebarInset className="max-w-full md:peer-data-[state=collapsed]:w-[calc(100vw-var(--sidebar-width-icon))] md:peer-data-[state=expanded]:w-[calc(100vw-var(--sidebar-width))]">
          <div className="flex h-full min-h-0 flex-1 flex-col">
            {showHeader ? (
              <ProductHeader
                breadcrumbs={breadcrumbs}
                className={headerClassName}
              />
            ) : null}
            <main className={cn("flex min-h-0 flex-1 flex-col", mainClassName)}>
              {children}
            </main>
            <AgentationSurface />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
