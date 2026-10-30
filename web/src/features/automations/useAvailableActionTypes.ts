import { useSession } from "next-auth/react";

import { type ActionTypes } from "@langfuse/shared";
import { useLangfuseCloudRegion } from "@/src/features/organizations";

const cloudAdminActionTypes: readonly ActionTypes[] = ["PAGERDUTY"];

/** useAvailableActionTypes drops action types limited to Langfuse Cloud admins for everyone else. */
export function useAvailableActionTypes(
  actionTypes: readonly ActionTypes[],
): ActionTypes[] {
  const session = useSession();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  if (isLangfuseCloud && session.data?.user?.admin === true) {
    return [...actionTypes];
  }
  return actionTypes.filter(
    (actionType) => !cloudAdminActionTypes.includes(actionType),
  );
}
