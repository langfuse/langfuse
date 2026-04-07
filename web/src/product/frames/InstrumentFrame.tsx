import type { ReactNode } from "react";
import { ProjectFrame } from "./ProjectFrame";
import { type ShellBreadcrumbItem } from "../shell/Breadcrumbs";

export function InstrumentFrame({
  projectId,
  title,
  breadcrumbs,
  children,
}: {
  projectId: string;
  title: string;
  breadcrumbs: ShellBreadcrumbItem[];
  children: ReactNode;
}) {
  return (
    <ProjectFrame
      projectId={projectId}
      activeSection="instrument"
      title={title}
      breadcrumbs={breadcrumbs}
    >
      {children}
    </ProjectFrame>
  );
}
