import { useProject } from "@/src/features/projects/hooks";

/**
 * Whether the given project is forced onto the v3 experience via
 * LANGFUSE_FORCE_V3_EXPERIENCE. Resolved on the server and carried on the
 * session project, so it is known on first render. Returns false when no
 * project is resolved (safe default: not forced).
 */
export function useForceV3Experience(projectId?: string): boolean {
  const { project } = useProject(projectId ?? null);
  return project?.forceV3Experience === true;
}

/**
 * True once the project is resolved, or when there is no project id (nothing
 * to wait for). Only the admin fallback for non-member projects resolves
 * asynchronously. Use before showing surfaces that would flash for force-v3
 * tenants while the default is "not forced".
 */
export function useIsForceV3ExperienceSettled(projectId?: string): boolean {
  const { project } = useProject(projectId ?? null);
  return !projectId || project !== null;
}
