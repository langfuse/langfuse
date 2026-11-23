import type { RouterInputs } from "@/src/utils/api";

/** A key's or user's spend budget: the most it may cost per interval, in USD. */
export type GatewaySpendLimit =
  RouterInputs["aiGateway"]["createSpendLimits"]["spendLimit"];
