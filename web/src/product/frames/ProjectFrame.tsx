import type { ReactNode } from "react";
import { type ShellBreadcrumbItem } from "../shell/Breadcrumbs";
import { ProductAppShell } from "../shell/AppShell";
import { type ProjectPrimarySection } from "../shell/product-manifest";
import { type WorkspaceSelection } from "../shell/WorkspaceTree";

export function ProjectFrame({
  projectId,
  activeSection,
  breadcrumbs,
  workspaceSelection = null,
  children,
}: {
  projectId: string;
  activeSection?: ProjectPrimarySection;
  breadcrumbs: ShellBreadcrumbItem[];
  workspaceSelection?: WorkspaceSelection;
  children: ReactNode;
}) {
  return (
    <ProductAppShell
      projectId={projectId}
      activeSection={activeSection}
      breadcrumbs={breadcrumbs}
      workspaceSelection={workspaceSelection}
    >
      {children}
    </ProductAppShell>
  );
}
