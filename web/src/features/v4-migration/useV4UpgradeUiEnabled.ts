import { useSession } from "next-auth/react";

import { useForceV3Experience } from "@/src/features/v4-migration/useForceV3Experience";

/**
 * Whether this deployment shows the v4 migration UI at all, before the
 * per-project force-v3 suppression. Derived from the write mode once in the
 * auth session callback — see isV4UpgradeUiAvailable.
 */
export function useV4UpgradeUiFlag(): boolean {
  const { data: session } = useSession();

  return session?.user?.v4UpgradeUiAvailable === true;
}

/**
 * Master gate for the v4 migration/upgrade UI. Every migration surface (nav
 * pill, upgrade badges, panel provider, banner, status page) checks this hook,
 * so returning false for a forced-v3 project hides all of them at once — and
 * automatically restores the sidebar "V4 Preview" toggle, which only renders
 * when the migration UI is off.
 */
export function useV4UpgradeUiEnabled(projectId?: string): boolean {
  const available = useV4UpgradeUiFlag();
  const forceV3 = useForceV3Experience(projectId);
  return available && !forceV3;
}
