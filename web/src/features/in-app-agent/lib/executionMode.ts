import { api } from "@/src/utils/api";

/**
 * Unresolved reports background, the shipped default. Falling back to
 * foreground would let a slow query defeat the rollout.
 */
export function useInAppAgentBackgroundExecutionEnabled(
  projectId: string,
): boolean {
  const executionModeQuery = api.inAppAgent.getExecutionMode.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId),
      staleTime: Infinity,
      gcTime: Infinity,
    },
  );

  return executionModeQuery.data?.mode !== "foreground";
}
