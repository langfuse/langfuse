import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";
import { House, PlusIcon, Settings } from "@langfuse/icons";
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
  /** Ticked in the list; its settings get a link under the list. */
  currentProjectId?: string;
} & (
  | { state: "loading" }
  | {
      state: "loaded";
      projects: Project[];
    }
);

export function ProjectDropdownMenu(props: ProjectDropdownMenuProps) {
  const {
    children,
    organizationId,
    canCreateProjects,
    getProjectPath,
    currentProjectId,
  } = props;
  const projects = props.state === "loaded" ? props.projects : null;

  const items = useMemo<ComponentProps<typeof DropdownMenu>["items"]>(
    () => [
      ...(projects
        ? projects.map((project) => ({
            type: "item" as const,
            id: project.id,
            noCapture: true,
            title: project.name,
            variant: "entity" as const,
            icon: House,
            selected: project.id === currentProjectId,
            href: getProjectPath(project.id),
          }))
        : Array.from({ length: 3 }, (_, index) => ({
            type: "loading" as const,
            id: `loading-${index}`,
          }))),
      ...(currentProjectId || canCreateProjects
        ? [{ type: "separator" as const, id: "project-actions-separator" }]
        : []),
      ...(currentProjectId
        ? [
            {
              type: "item" as const,
              id: "project-settings",
              title: "Project settings",
              icon: Settings,
              href: `/project/${currentProjectId}/settings`,
              searchBehavior: "always-show" as const,
            },
          ]
        : []),
      ...(canCreateProjects
        ? [
            {
              type: "item" as const,
              id: "new-project",
              title: "New project",
              icon: PlusIcon,
              href: createProjectRoute(organizationId),
              searchBehavior: "always-show" as const,
            },
          ]
        : []),
    ],
    [
      canCreateProjects,
      currentProjectId,
      getProjectPath,
      organizationId,
      projects,
    ],
  );

  return (
    <DropdownMenu
      ariaLabel="Projects"
      items={items}
      width="wide"
      // Fits every project; scrolls only when taller than the window.
      maxHeight="calc(100dvh - 4rem)"
      search={{ placeholder: "Search projects..." }}
      emptyText="No project found."
    >
      {children}
    </DropdownMenu>
  );
}
