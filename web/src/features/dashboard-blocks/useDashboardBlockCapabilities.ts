import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api } from "@/src/utils/api";
import { readDashboardBlockCapabilities } from "./dashboard-block-capabilities";

export function useDashboardBlockCapabilities(
  projectId: string,
  enabled: boolean,
) {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const queryKey = getQueryKey(
    api.dashboard.getDashboardBlockCapabilities,
    { projectId },
    "query",
  );
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      readDashboardBlockCapabilities({
        queryClient,
        queryKey,
        read: () =>
          utils.client.dashboard.getDashboardBlockCapabilities.query(
            { projectId },
            { signal },
          ),
      }),
    enabled: enabled && Boolean(projectId),
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: (query) => {
      const active = query.state.data?.multiQuery || query.state.data?.markdown;
      return active ? 30_000 : false;
    },
    refetchIntervalInBackground: false,
    retry: false,
    meta: { silentHttpCodes: [404], toastOperation: "dashboard.query" },
  });
}
