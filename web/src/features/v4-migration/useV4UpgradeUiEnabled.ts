import { useSession } from "next-auth/react";

/**
 * Whether this deployment shows the v4 migration UI. Derived from the write
 * mode once in the auth session callback — see isV4UpgradeUiAvailable.
 */
export function useV4UpgradeUiFlag(): boolean {
  const { data: session } = useSession();

  return session?.user?.v4UpgradeUiAvailable === true;
}

/**
 * Master gate for the v4 migration/upgrade UI. Every migration surface (nav
 * pill, upgrade badges, panel provider, banner, status page) checks this hook.
 */
export function useV4UpgradeUiEnabled(): boolean {
  return useV4UpgradeUiFlag();
}
