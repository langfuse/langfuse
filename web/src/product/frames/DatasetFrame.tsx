import type { ReactNode } from "react";
import { ProjectFrame } from "./ProjectFrame";
import { type ShellBreadcrumbItem } from "../shell/Breadcrumbs";

export function DatasetFrame({
  projectId,
  title,
  breadcrumbs,
  datasetPath,
  children,
}: {
  projectId: string;
  title: string;
  breadcrumbs: ShellBreadcrumbItem[];
  datasetPath: string[];
  children: ReactNode;
}) {
  return (
    <ProjectFrame
      projectId={projectId}
      title={title}
      breadcrumbs={breadcrumbs}
      workspaceSelection={{ kind: "dataset", path: datasetPath }}
    >
      {children}
    </ProjectFrame>
  );
}
