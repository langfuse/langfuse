import { useSession } from "next-auth/react";

export function useV4UpgradeUiEnabled(): boolean {
  const { data: session } = useSession();

  return session?.user?.featureFlags.v4UpgradeUi === true;
}
