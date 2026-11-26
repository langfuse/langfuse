import { api } from "@/src/utils/api";

/** useProjectGroups loads the groups visible on a project, with their roles there. */
export function useProjectGroups(projectId: string, enabled: boolean) {
  return api.groups.projectList.useQuery({ projectId }, { enabled });
}
