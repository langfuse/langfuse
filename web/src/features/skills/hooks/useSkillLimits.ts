import { api } from "@/src/utils/api";

const queryOptions = { refetchOnWindowFocus: false, staleTime: 60_000 };

export function useSkillLimits(projectId: string) {
  return api.skills.limits.useQuery({ projectId }, queryOptions);
}
