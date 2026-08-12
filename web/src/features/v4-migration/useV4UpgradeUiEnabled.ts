import { useSession } from "next-auth/react";

import { useForceV3Experience } from "@/src/features/v4-migration/useForceV3Experience";

/**
 * Raw `v4UpgradeUi` feature-preview flag, without the force-v3 suppression.
 */
export function useV4UpgradeUiFlag(): boolean {
  const { data: session } = useSession();

  return session?.user?.featureFlags.v4UpgradeUi === true;
}

/**
 * Master gate for the v4 migration/upgrade UI. Every migration surface (nav
 * pill, upgrade badges, panel provider, banner, status page) checks this hook,
 * so returning false for a forced-v3 project hides all of them at once — and
 * automatically restores the sidebar "V4 Preview" toggle, which only renders
 * when the migration UI is off.
 */
export function useV4UpgradeUiEnabled(projectId?: string): boolean {
  const flag = useV4UpgradeUiFlag();
  // Suppress the migration UI for forced-v3 projects. Pass the project id from
  // project-scoped surfaces; org-level surfaces omit it (no project to
  // suppress) and get the raw flag. The query only fires when the flag is on,
  // so non-flagged users trigger no request.
  const forceV3 = useForceV3Experience(projectId, { enabled: flag });

  return flag && !forceV3;
}
