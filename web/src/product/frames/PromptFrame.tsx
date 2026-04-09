import type { ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import { GreenfieldDocSignals } from "../components/GreenfieldDocSignals";
import { type ShellBreadcrumbItem } from "../shell/Breadcrumbs";
import { ProductAppShell } from "../shell/AppShell";
import { type PromptStage } from "../shell/product-manifest";

export function PromptFrame({
  projectId,
  breadcrumbs,
  promptPath,
  activeStage,
  children,
}: {
  projectId: string;
  breadcrumbs: ShellBreadcrumbItem[];
  promptPath: string[];
  activeStage: PromptStage;
  children: ReactNode;
}) {
  return (
    <ProductAppShell
      className={cn("greenfield-pretext greenfield-workspace-shell")}
      headerClassName="bg-[hsl(var(--sidebar-background))]"
      mainClassName="greenfield-workspace-content"
      projectId={projectId}
      breadcrumbs={breadcrumbs}
      workspaceSelection={{ kind: "prompt", path: promptPath }}
      activePromptStage={activeStage}
    >
      {/* Iterate signals are intentionally commented out for now. */}
      {activeStage === "iterate" ? null : (
        <GreenfieldDocSignals section={activeStage} />
      )}
      {children}
    </ProductAppShell>
  );
}
