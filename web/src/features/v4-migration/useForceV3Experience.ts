import { api } from "@/src/utils/api";

function useForceV3ExperienceQuery(projectId?: string) {
  return api.v4Transition.forceV3Experience.useQuery(
    { projectId: projectId ?? "" },
    {
      // Callers that only need the value behind another gate (e.g. the v4
      // upgrade flag) can pass enabled:false to avoid firing the query for
      // users the answer can't affect.
      enabled: Boolean(projectId),
      staleTime: Infinity,
    },
  );
}

/**
 * Whether the given project is forced onto the v3 experience via
 * LANGFUSE_FORCE_V3_EXPERIENCE. The value is static per deployment, so it is
 * cached for the session. Returns false while loading or when no project id is
 * available (safe default: not forced).
 */
export function useForceV3Experience(projectId?: string): boolean {
  const forceV3 = useForceV3ExperienceQuery(projectId);
  return forceV3.data ?? false;
}

/**
 * True once the force-v3 query has a definitive answer for this project, or
 * when there is no project id (nothing to wait for). Use before showing
 * surfaces that would flash for force-v3 tenants while the default is
 * "not forced".
 */
export function useIsForceV3ExperienceSettled(projectId?: string): boolean {
  const forceV3 = useForceV3ExperienceQuery(projectId);
  if (!projectId) {
    return true;
  }
  return forceV3.isFetched;
}
