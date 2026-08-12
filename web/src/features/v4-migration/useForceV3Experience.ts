import { api } from "@/src/utils/api";
import { useQueryProject } from "@/src/features/projects/hooks";

/**
 * Whether the given project (default: the current route's project) is forced
 * onto the v3 experience via LANGFUSE_FORCE_V3_EXPERIENCE.
 *
 * Delivered through tRPC (mirrors `codeEvalCapabilities`) rather than the
 * session, so no `web/src/env.mjs` / `next-auth.d.ts` duplication is needed.
 * The value is static per deployment, so we cache it forever.
 *
 * Loading direction is safe-by-default: while the query resolves the project is
 * treated as NOT forced, so regular deployments never wait on a round-trip and
 * never have their migration UI suppressed.
 */
export function useForceV3Experience(projectId?: string): boolean {
  const { project } = useQueryProject();
  const resolvedProjectId = projectId ?? project?.id;

  const forceV3 = api.v4Transition.forceV3Experience.useQuery(
    { projectId: resolvedProjectId as string },
    {
      enabled: Boolean(resolvedProjectId),
      staleTime: Infinity,
    },
  );

  return forceV3.data === true;
}
