import { useSession } from "next-auth/react";
import type { Flag } from "../types";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

export default function useIsExperimentV4Enabled(feature: Flag): boolean {
  const session = useSession();
  const { isLangfuseCloud } = useLangfuseCloudRegion();

  const isAdmin = session.data?.user?.admin ?? false;

  const isFeatureEnabledOnUser =
    session.data?.user?.featureFlags[feature] ?? false;

  const { isBetaEnabled } = useV4Beta();

  return (
    isLangfuseCloud && isBetaEnabled && (isAdmin || isFeatureEnabledOnUser)
  );
}
