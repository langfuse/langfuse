import {
  DropdownMenuContent,
  DropdownMenuItemWithSecondaryAction,
  DropdownMenuSeparator,
  DropdownMenuLoadingItem,
} from "@/src/components/ui/dropdown-menu";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";
import { PlusIcon, Settings } from "lucide-react";
import { type Session } from "next-auth";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("workspace.switcher");

  return (
    <DropdownMenuContent align="start" header={t("projects")} maxHeight="15rem">
      {props.state === "loaded" ? (
        props.projects.map((dropdownProject) => (
          <DropdownMenuItemWithSecondaryAction
            key={dropdownProject.id}
            title={dropdownProject.name}
            href={getProjectPath(dropdownProject.id)}
            secondaryAction={{
              href: `/project/${dropdownProject.id}/settings`,
              ariaLabel: t("goToSettings", { name: dropdownProject.name }),
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
          <DropdownMenuItemWithSecondaryAction
            title={t("newProject")}
            href={createProjectRoute(organizationId)}
            icon={PlusIcon}
          />
        </>
      )}
    </DropdownMenuContent>
  );
}
