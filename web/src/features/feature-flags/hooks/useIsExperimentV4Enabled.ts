import { useSession } from "next-auth/react";
import type { Flag } from "../types";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

export default function useIsExperimentV4Enabled(): {
  isEnabled: boolean;
} {
  const session = useSession();
  const { isLangfuseCloud } = useLangfuseCloudRegion();

  const isAdmin = session.data?.user?.admin ?? false;

  const isFeatureEnabledOnUser =
    session.data?.user?.featureFlags["experimentsV4Enabled"] ?? false;

  const { isBetaEnabled } = useV4Beta();

  return {
    isEnabled:
      isLangfuseCloud && isBetaEnabled && (isAdmin || isFeatureEnabledOnUser),
  };
}
