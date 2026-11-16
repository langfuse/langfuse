/**
 * isV4CutoffActive decides one Langfuse Cloud v3 cutoff.
 * Self-hosted installs and exempt projects are never cut. Each caller passes its own switch.
 */
export function isV4CutoffActive(params: {
  cloudRegion: string | undefined;
  enabled: string | undefined;
  exemptProjectIds: readonly string[];
  projectId: string | null | undefined;
}): boolean {
  if (!params.cloudRegion) return false;
  if (params.enabled !== "true") return false;
  if (params.projectId && params.exemptProjectIds.includes(params.projectId))
    return false;
  return true;
}
