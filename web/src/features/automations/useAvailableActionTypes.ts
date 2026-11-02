import { useSession } from "next-auth/react";

import { type ActionTypes } from "@langfuse/shared";
import { hasInternalAccess } from "@/src/features/feature-flags";
import { useLangfuseCloudRegion } from "@/src/features/organizations";

const internalCloudActionTypes: readonly ActionTypes[] = ["PAGERDUTY"];

/** useAvailableActionTypes drops action types limited to Langfuse Cloud deployments with internal access. */
export function useAvailableActionTypes(
  actionTypes: readonly ActionTypes[],
): ActionTypes[] {
  const session = useSession();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const internalAccess = hasInternalAccess({
    isExperimentalFeaturesEnabled:
      session.data?.environment.enableExperimentalFeatures === true,
  });
  if (isLangfuseCloud && internalAccess) {
    return [...actionTypes];
  }
  return actionTypes.filter(
    (actionType) => !internalCloudActionTypes.includes(actionType),
  );
}
