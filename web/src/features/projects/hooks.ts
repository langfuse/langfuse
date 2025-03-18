import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export const useQueryProject = () => {
  const router = useRouter();
  const projectId = router.query.projectId;
  return useProject(typeof projectId === "string" ? projectId : null);
};

export const useProject = (projectId: string | null) => {
  const session = useSession();
  if (projectId === null) return { project: null, organization: null };

  const data = session.data?.user?.organizations
    // map to {project, organization}[]
    .flatMap((org) =>
      org.projects.map((project) => ({ project, organization: org })),
    )
    // find the project with the matching id
    .find(({ project }) => project.id === projectId);

  if (!data)
    return {
      project: null,
      organization: null,
    };

  // explicitly destructuring the data object to make it clear what is being returned
  return {
    project: data.project,
    organization: data.organization,
  };
};

export const useQueryProjectOrOrganization = () => {
  const p = useQueryProject();
  const o = useQueryOrganization();

  return p.project ? p : { organization: o, project: null };
};
