import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";
import { PlusIcon, Settings } from "@langfuse/icons";
import { type Session } from "next-auth";
import { type ComponentProps, useMemo } from "react";

type Project = NonNullable<
  Session["user"]
>["organizations"][number]["projects"][number];

type ProjectDropdownMenuProps = {
  children: ComponentProps<typeof DropdownMenu>["children"];
  organizationId: string;
  canCreateProjects: boolean;
  getProjectPath: (projectId: string) => string;
} & (
  | { state: "loading" }
  | {
      state: "loaded";
      projects: Project[];
    }
);

export function ProjectDropdownMenu(props: ProjectDropdownMenuProps) {
  const { children, organizationId, canCreateProjects, getProjectPath } = props;
  const projects = props.state === "loaded" ? props.projects : null;

  const items = useMemo<ComponentProps<typeof DropdownMenu>["items"]>(
    () =>
      projects
        ? projects.map((project) => ({
            type: "item" as const,
            id: project.id,
            noCapture: true,
            title: project.name,
            href: getProjectPath(project.id),
            secondaryAction: {
              href: `/project/${project.id}/settings`,
              ariaLabel: `Go to settings for ${project.name}`,
              icon: Settings,
            },
          }))
        : Array.from({ length: 3 }, (_, index) => ({
            type: "loading" as const,
            id: `loading-${index}`,
          })),
    [getProjectPath, projects],
  );

  return (
    <DropdownMenu
      title="Projects"
      headerAction={
        canCreateProjects
          ? {
              text: "New",
              tooltip: "New project",
              href: createProjectRoute(organizationId),
              icon: PlusIcon,
            }
          : undefined
      }
      items={items}
      search={{ placeholder: "Search projects..." }}
      emptyText="No project found."
    >
      {children}
    </DropdownMenu>
  );
}
