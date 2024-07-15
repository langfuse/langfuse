import { useQueryOrganization } from "@/src/features/organizations/utils/useOrganization";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";

export const useQueryProject = () => {
  const router = useRouter();
  const projectId = router.query.projectId;
  return useProject(typeof projectId === "string" ? projectId : null);
};

export const useProject = (projectId: string | null) => {
  const project = api.projects.byId.useQuery(
    {
      projectId: projectId as string,
    },
    {
      enabled: Boolean(projectId),
    },
  );

  if (!project.data) return null;
  return project.data;
};

export const useQueryProjectAndOrganization = () => {
  const project = useQueryProject();
  const organization = useQueryOrganization();
  return { project, organization };
};
