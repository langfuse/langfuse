/**
 * isV4CutoffActive decides one Langfuse Cloud v3 cutoff.
 * Self-hosted installs and exempt orgs are never cut. Each caller passes its own switch.
 */
export function isV4CutoffActive(params: {
  cloudRegion: string | undefined;
  enabled: string | undefined;
  exemptOrgIds: readonly string[];
  orgId: string | null | undefined;
}): boolean {
  if (!params.cloudRegion) return false;
  if (params.enabled !== "true") return false;
  if (params.orgId && params.exemptOrgIds.includes(params.orgId)) return false;
  return true;
}

export const V4_UPGRADE_GUIDE =
  "https://langfuse.com/faq/all/upgrade-to-langfuse-v4";
