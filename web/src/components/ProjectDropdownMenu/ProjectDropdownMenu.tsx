import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { createProjectRoute } from "@/src/features/setup";
import { PlusIcon, Settings } from "lucide-react";
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
    () => [
      ...(projects
        ? projects.map((project) => ({
            type: "item" as const,
            id: project.id,
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
          }))),
      ...(canCreateProjects
        ? [
            { type: "separator" as const, id: "create-separator" },
            {
              type: "item" as const,
              id: "create",
              title: "New Project",
              href: createProjectRoute(organizationId),
              icon: PlusIcon,
            },
          ]
        : []),
    ],
    [canCreateProjects, getProjectPath, organizationId, projects],
  );

  return (
    <DropdownMenu title="Projects" items={items}>
      {children}
    </DropdownMenu>
  );
}
