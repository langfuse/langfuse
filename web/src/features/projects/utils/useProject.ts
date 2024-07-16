import { useQueryOrganization } from "@/src/features/organizations/hooks/useOrganization";
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
  if (!project.data)
    return {
      project: null,
      organization: null,
    };
  // explicitly destructuring the data object to make it clear what is being returned
  return {
    project: project.data.project,
    organization: project.data.organization,
  };
};

export const useQueryProjectOrOrganization = () => {
  const p = useQueryProject();
  const o = useQueryOrganization();

  return p || { organization: o, project: null };
};
