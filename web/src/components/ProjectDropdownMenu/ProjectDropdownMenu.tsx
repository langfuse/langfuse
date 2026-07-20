import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  onGoToProjectSettings: (projectId: string) => void;
} & (
  | { state: "loading" }
  | {
      state: "loaded";
      projects: Project[];
    }
);

const LoadingMenuItem = () => (
  <DropdownMenuItem>
    <span className="mr-1.5 inline-flex">
      <Spinner size="sm" />
    </span>
    Loading...
  </DropdownMenuItem>
);

export function ProjectDropdownMenu(props: ProjectDropdownMenuProps) {
  const {
    organizationId,
    canCreateProjects,
    getProjectPath,
    onGoToProjectSettings,
  } = props;

  return (
    <DropdownMenuContent align="start">
      <DropdownMenuItem asChild className="font-bold">
        <Link
          href={`/organization/${organizationId}`}
          className="cursor-pointer"
        >
          Projects
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <div className="max-h-36 overflow-y-auto">
        {props.state === "loaded" ? (
          props.projects.map((dropdownProject) => (
            <DropdownMenuItem key={dropdownProject.id} asChild>
              <Link
                href={getProjectPath(dropdownProject.id)}
                className="flex cursor-pointer justify-between"
              >
                <span
                  className="max-w-36 overflow-hidden text-ellipsis whitespace-nowrap"
                  title={dropdownProject.name}
                >
                  {dropdownProject.name}
                </span>
                <Button
                  asChild
                  variant="ghost"
                  size="xs"
                  className="hover:bg-background -my-1 ml-4"
                >
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onGoToProjectSettings(dropdownProject.id);
                    }}
                  >
                    <Settings size={12} />
                  </div>
                </Button>
              </Link>
            </DropdownMenuItem>
          ))
        ) : (
          <LoadingMenuItem />
        )}
      </div>

      {canCreateProjects && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Button
              variant="ghost"
              size="xs"
              className="h-8 w-full text-sm font-normal"
              asChild
            >
              <Link href={createProjectRoute(organizationId)}>
                <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
                New Project
              </Link>
            </Button>
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );
}
