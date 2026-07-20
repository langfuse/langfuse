import {
  DropdownMenuContent,
  DropdownMenuItem,
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
    <DropdownMenuContent align="start">
      <DropdownMenuLabel>Projects</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div className="max-h-36 overflow-y-auto">
        {props.state === "loaded" ? (
          props.projects.map((dropdownProject) => (
            <DropdownMenuItem key={dropdownProject.id} className="p-0">
              <Link
                href={getProjectPath(dropdownProject.id)}
                className="flex min-w-0 flex-1 cursor-pointer px-2 py-1.5"
              >
                <span
                  className="max-w-36 overflow-hidden text-ellipsis whitespace-nowrap"
                  title={dropdownProject.name}
                >
                  {dropdownProject.name}
                </span>
              </Link>
              <Link
                href={`/project/${dropdownProject.id}/settings`}
                aria-label={`Go to settings for ${dropdownProject.name}`}
                className="hover:bg-background flex size-8 shrink-0 cursor-pointer items-center justify-center"
                onClick={(event) => event.stopPropagation()}
              >
                <Settings size={12} />
              </Link>
            </DropdownMenuItem>
          ))
        ) : (
          <>
            <DropdownMenuLoadingItem />
            <DropdownMenuLoadingItem />
            <DropdownMenuLoadingItem />
          </>
        )}
      </div>

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
