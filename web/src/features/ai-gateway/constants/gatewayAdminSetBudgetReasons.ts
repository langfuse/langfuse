/** Why a gateway member cannot change or reset a key budget that an admin set, including the organization's default. */
export const GATEWAY_ADMIN_SET_BUDGET_CHANGE_REASON =
  "A gateway admin set this budget, so only an admin can change it.";

export const GATEWAY_ADMIN_SET_BUDGET_RESET_REASON =
  "A gateway admin set this budget, so only an admin can reset it.";

export const GATEWAY_DEFAULT_BUDGET_CHANGE_REASON =
  "This key gets the organization's default budget. Only a gateway admin can give it a different one.";

/** Fits beside a disabled menu action, whose full reason may be truncated. */
export const GATEWAY_ADMIN_SET_BUDGET_SHORT_REASON = "Set by a gateway admin";
