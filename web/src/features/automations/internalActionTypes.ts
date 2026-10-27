import { type ActionTypes } from "@langfuse/shared";

const internalActionTypes: readonly ActionTypes[] = ["PAGERDUTY"];

/** isInternalActionType reports whether an action type is limited to users with internal view. */
export function isInternalActionType(actionType: ActionTypes): boolean {
  return internalActionTypes.includes(actionType);
}

/** availableActionTypes drops internal action types for users without internal view. */
export function availableActionTypes(
  actionTypes: readonly ActionTypes[],
  internalFeaturesEnabled: boolean,
): ActionTypes[] {
  if (internalFeaturesEnabled) return [...actionTypes];
  return actionTypes.filter((actionType) => !isInternalActionType(actionType));
}
