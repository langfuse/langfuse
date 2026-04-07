import type { ReactNode } from "react";
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
      title={title}
      titleContent={<PromptName title={title} />}
      breadcrumbs={breadcrumbs}
      workspaceSelection={{ kind: "prompt", path: promptPath }}
      promptTabs={getPromptStageTabs(projectId, promptPath)}
      activePromptStage={activeStage}
    >
      {children}
    </ProductAppShell>
  );
}

function PromptName({ title }: { title: string }) {
  return (
    <span className="text-foreground block truncate text-sm font-medium">
      {title}
    </span>
  );
}
