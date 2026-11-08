import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";
import { ArrowRight, PlusIcon, Settings } from "@langfuse/icons";
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
  /** Adds an "AI Gateway" row at the bottom when set. */
  gatewayHref?: string;
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
    gatewayHref,
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
              searchBehavior: "always-show" as const,
              href: createProjectRoute(organizationId),
              icon: PlusIcon,
            },
          ]
        : []),
      ...(gatewayHref
        ? [
            { type: "separator" as const, id: "gateway-separator" },
            {
              type: "item" as const,
              id: "ai-gateway",
              title: "AI Gateway",
              description: "Models, keys and spend",
              searchBehavior: "always-show" as const,
              href: gatewayHref,
              media: (
                <span className="bg-primary flex size-6 items-center justify-center rounded-md">
                  <LangfuseIcon size={16} alt="" />
                </span>
              ),
              badge: <ArrowRight size="sm" color="muted" aria-hidden />,
            },
          ]
        : []),
    ],
    [canCreateProjects, gatewayHref, getProjectPath, organizationId, projects],
  );

  return (
    <DropdownMenu
      title="Projects"
      items={items}
      search={{ placeholder: "Search projects..." }}
      emptyText="No project found."
    >
      {children}
    </DropdownMenu>
  );
}
