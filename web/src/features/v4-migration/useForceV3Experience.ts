import { api } from "@/src/utils/api";

/**
 * Whether the given project is forced onto the v3 experience via
 * LANGFUSE_FORCE_V3_EXPERIENCE.
 */
export function useForceV3Experience(projectId: string): boolean {
  const forceV3 = api.v4Transition.forceV3Experience.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId),
    },
  );

  return forceV3.data?.forceV3 ?? false;
}
