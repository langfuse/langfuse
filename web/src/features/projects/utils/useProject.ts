import { useQueryOrganization } from "@/src/features/organizations/utils/useOrganization";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export const useQueryProject = () => {
  const router = useRouter();
  const projectId = router.query.projectId;
  return useProject(typeof projectId === "string" ? projectId : null);
};

export const useProject = (projectId: string | null) => {
  const session = useSession();

  const organizations = session.data?.user?.organizations || [];

  if (!projectId || organizations.length === 0)
    return { project: null, organization: null };

  const project = organizations
    .flatMap((org) => org.projects)
    .find((project) => project.id === projectId);
  if (!project) return { project: null, organization: null };

  const organization = organizations.find((org) =>
    org.projects.some((project) => project.id === projectId),
  );
  if (!organization) return { project: null, organization: null };

  return { project, organization };
};

export const useQueryProjectOrOrganization = () => {
  const { project, organization } = useQueryProject();
  const queryOrg = useQueryOrganization();
  return { project, organization: queryOrg ?? organization };
};
