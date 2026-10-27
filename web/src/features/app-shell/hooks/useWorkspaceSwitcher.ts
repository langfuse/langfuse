import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import {
  Building2,
  LayoutGrid,
  Plus,
  Settings,
  type IconComponent,
} from "@langfuse/icons";
import { env } from "@/src/env.mjs";
import {
  buildSwitcherSections,
  type SwitcherOrganization,
} from "@/src/features/app-shell/fns/buildSwitcherSections";
import { useRecentProjects } from "@/src/features/app-shell/hooks/useRecentProjects";
import {
  useOrgProjectSwitchPaths,
  useQueryProjectOrOrganization,
} from "@/src/features/projects";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import {
  createOrganizationRoute,
  createProjectRoute,
} from "@/src/features/setup";

type SwitcherAction = {
  id:
    | "organization-overview"
    | "new-project"
    | "project-settings"
    | "organization-settings"
    | "new-organization"
    | "all-organizations";
  label: string;
  href: string;
  icon: IconComponent;
  keywords: string[];
};

/**
 * Data for the project and organization switcher: the prepared lists, the
 * quick actions the user may take, and where each choice navigates. Project
 * switches keep the page the user is on (e.g. stay on Traces).
 */
export function useWorkspaceSwitcher() {
  const router = useRouter();
  const session = useSession();
  const user = session.data?.user;
  const { organization, project } = useQueryProjectOrOrganization();
  const { getProjectPath, getOrgPath } = useOrgProjectSwitchPaths();
  const { recentProjectIds } = useRecentProjects(user?.id ?? "anonymous");
  const canCreateProjects = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "projects:create",
  });

  const sections = buildSwitcherSections({
    organizations: user?.organizations ?? [],
    currentOrganizationId: organization?.id ?? null,
    currentProjectId: project?.id ?? null,
    recentProjectIds,
    demoOrganizationId: env.NEXT_PUBLIC_DEMO_ORG_ID ?? null,
  });

  const actions: SwitcherAction[] = [
    ...(organization
      ? [
          {
            id: "organization-overview" as const,
            label: `${organization.name} overview`,
            href: `/organization/${organization.id}`,
            icon: LayoutGrid,
            keywords: ["projects", "status", "usage"],
          },
        ]
      : []),
    ...(organization && canCreateProjects
      ? [
          {
            id: "new-project" as const,
            label: `New project in ${organization.name}`,
            href: createProjectRoute(organization.id),
            icon: Plus,
            keywords: ["create", "add"],
          },
        ]
      : []),
    ...(project
      ? [
          {
            id: "project-settings" as const,
            label: "Project settings",
            href: `/project/${project.id}/settings`,
            icon: Settings,
            keywords: ["configure", "api keys"],
          },
        ]
      : []),
    ...(organization
      ? [
          {
            id: "organization-settings" as const,
            label: "Organization settings",
            href: `/organization/${organization.id}/settings`,
            icon: Settings,
            keywords: ["members", "billing", "configure"],
          },
        ]
      : []),
    ...(user?.canCreateOrganizations
      ? [
          {
            id: "new-organization" as const,
            label: "New organization",
            href: createOrganizationRoute,
            icon: Plus,
            keywords: ["create", "add"],
          },
        ]
      : []),
    {
      id: "all-organizations",
      label: "All organizations",
      href: "/organizations",
      icon: Building2,
      keywords: ["overview", "projects"],
    },
  ];

  const isOnOrganizationPage =
    typeof router.query.organizationId === "string" &&
    typeof router.query.projectId !== "string";

  const organizationHref = (target: SwitcherOrganization) => {
    if (isOnOrganizationPage) return getOrgPath(target.id);
    return target.landingProjectId
      ? getProjectPath(target.landingProjectId)
      : `/organization/${target.id}`;
  };

  return {
    sections,
    actions,
    currentOrganization: organization,
    projectHref: getProjectPath,
    organizationHref,
  };
}
