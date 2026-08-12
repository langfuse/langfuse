import { api } from "@/src/utils/api";

/**
 * Whether the given project is forced onto the v3 experience via
 * LANGFUSE_FORCE_V3_EXPERIENCE. The value is static per deployment, so it is
 * cached for the session. Returns false while loading or when no project id is
 * available (safe default: not forced).
 */
export function useForceV3Experience(projectId?: string): boolean {
  const forceV3 = api.v4Transition.forceV3Experience.useQuery(
    { projectId: projectId ?? "" },
    {
      // Callers that only need the value behind another gate (e.g. the v4
      // upgrade flag) can pass enabled:false to avoid firing the query for
      // users the answer can't affect.
      enabled: Boolean(projectId),
      staleTime: Infinity,
    },
  );
  return forceV3.data ?? false;
}
