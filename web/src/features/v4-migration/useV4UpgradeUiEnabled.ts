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
 * Gate for contextual v4 migration wizard surfaces. The account-level status
 * and settings page uses useV4UpgradeUiFlag instead so users can always
 * re-enable a dismissed wizard.
 */
export function useV4UpgradeUiEnabled(projectId?: string): boolean {
  const { data: session } = useSession();
  const available = session?.user?.v4UpgradeUiAvailable === true;
  // Default to enabled for sessions issued before the preference was added.
  const userEnabled = session?.user?.v4MigrationWizardEnabled !== false;
  const forceV3 = useForceV3Experience(projectId);
  return available && userEnabled && !forceV3;
}
