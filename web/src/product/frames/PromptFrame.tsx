import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { type ShellBreadcrumbItem } from "../shell/Breadcrumbs";
import { ProductAppShell } from "../shell/AppShell";
import {
  type PromptStage,
  getPromptStageTabs,
} from "../shell/product-manifest";

export function PromptFrame({
  projectId,
  title,
  breadcrumbs,
  promptPath,
  activeStage,
  children,
}: {
  projectId: string;
  title: string;
  breadcrumbs: ShellBreadcrumbItem[];
  promptPath: string[];
  activeStage: PromptStage;
  children: ReactNode;
}) {
  return (
    <ProductAppShell
      scope="project"
      projectId={projectId}
      activeSection="workspace"
      title={title}
      titleContent={<PromptSelector title={title} />}
      breadcrumbs={breadcrumbs}
      workspaceSelection={{ kind: "prompt", path: promptPath }}
      promptTabs={getPromptStageTabs(projectId, promptPath)}
      activePromptStage={activeStage}
    >
      {children}
    </ProductAppShell>
  );
}

function PromptSelector({ title }: { title: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-foreground hover:text-foreground h-7 max-w-full gap-1 px-2 font-medium shadow-none"
      aria-label="Select prompt"
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate">{title}</span>
      </span>
      <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
    </Button>
  );
}
