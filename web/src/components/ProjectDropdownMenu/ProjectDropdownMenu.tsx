import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemWithSecondaryAction,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuLoadingItem,
} from "@/src/components/ui/dropdown-menu";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";
import { PlusIcon, Settings } from "lucide-react";
import { type Session } from "next-auth";
import Link from "next/link";

type Project = NonNullable<
  Session["user"]
>["organizations"][number]["projects"][number];

type ProjectDropdownMenuProps = {
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
  const { organizationId, canCreateProjects, getProjectPath } = props;

  return (
    <DropdownMenuContent align="start" maxHeight="15rem">
      <DropdownMenuLabel>Projects</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {props.state === "loaded" ? (
        props.projects.map((dropdownProject) => (
          <DropdownMenuItemWithSecondaryAction
            key={dropdownProject.id}
            title={dropdownProject.name}
            href={getProjectPath(dropdownProject.id)}
            secondaryAction={{
              href: `/project/${dropdownProject.id}/settings`,
              ariaLabel: `Go to settings for ${dropdownProject.name}`,
              icon: Settings,
            }}
          />
        ))
      ) : (
        <>
          <DropdownMenuLoadingItem />
          <DropdownMenuLoadingItem />
          <DropdownMenuLoadingItem />
        </>
      )}

      {canCreateProjects && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={createProjectRoute(organizationId)}>
              <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
              New Project
            </Link>
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );
}
