import { useSession } from "next-auth/react";

import { isFeatureEnabledForSession } from "@/src/features/feature-flags/hooks/isFeatureEnabledForSession";
import type { Flag } from "../types";

export default function useIsFeatureEnabled(
  feature: Flag,
  {
    projectId,
    organizationId,
  }: {
    projectId?: string;
    organizationId?: string;
  } = {},
): boolean {
  const session = useSession();
  return isFeatureEnabledForSession(session.data, feature, {
    projectId,
    organizationId,
  });
}
