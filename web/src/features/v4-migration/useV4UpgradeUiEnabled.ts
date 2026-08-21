import { useSession } from "next-auth/react";

import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { useForceV3Experience } from "@/src/features/v4-migration/useForceV3Experience";

/**
 * Raw `v4UpgradeUi` feature-preview flag, without the force-v3 suppression.
 */
export function useV4UpgradeUiFlag({
  projectId,
  organizationId,
}: { projectId?: string; organizationId?: string } = {}): boolean {
  const { data: session } = useSession();

  return (
    getContextualFeatureFlags(session?.user, { projectId, organizationId })
      ?.v4UpgradeUi === true
  );
}

/**
 * Master gate for the v4 migration/upgrade UI. Every migration surface (nav
 * pill, upgrade badges, panel provider, banner, status page) checks this hook,
 * so returning false for a forced-v3 project hides all of them at once — and
 * automatically restores the sidebar "V4 Preview" toggle, which only renders
 * when the migration UI is off.
 */
export function useV4UpgradeUiEnabled(projectId?: string): boolean {
  const flag = useV4UpgradeUiFlag({ projectId });
  const forceV3 = useForceV3Experience(projectId);
  return flag && !forceV3;
}
