import type { ReactNode } from "react";
import { type ShellBreadcrumbItem } from "../shell/Breadcrumbs";
import { ProductAppShell } from "../shell/AppShell";
import { type ProjectPrimarySection } from "../shell/product-manifest";
import { type WorkspaceSelection } from "../shell/WorkspaceTree";

export function ProjectFrame({
  projectId,
  activeSection,
  title,
  breadcrumbs,
  workspaceSelection = null,
  children,
}: {
  projectId: string;
  activeSection: ProjectPrimarySection;
  title: string;
  breadcrumbs: ShellBreadcrumbItem[];
  workspaceSelection?: WorkspaceSelection;
  children: ReactNode;
}) {
  return (
    <ProductAppShell
      scope="project"
      projectId={projectId}
      activeSection={activeSection}
      title={title}
      breadcrumbs={breadcrumbs}
      workspaceSelection={workspaceSelection}
    >
      {children}
    </ProductAppShell>
  );
}
