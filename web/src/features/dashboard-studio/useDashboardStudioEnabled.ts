import { api } from "@/src/utils/api";

export function useDashboardStudioEnabled(projectId: string) {
  return api.dashboardStudio.isEnabled.useQuery(
    { projectId },
    { staleTime: 60_000 },
  );
}
