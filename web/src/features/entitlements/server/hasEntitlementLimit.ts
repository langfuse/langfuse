import {
  entitlementAccess,
  type EntitlementLimit,
} from "@/src/features/entitlements/constants/entitlements";
import { type Plan } from "@langfuse/shared";

const hasEntitlementLimitBasedOnPlan = ({
  plan,
  entitlementLimit,
}: {
  plan: Plan | null;
  entitlementLimit: EntitlementLimit;
}) => {
  return entitlementAccess[plan ?? "oss"].entitlementLimits[entitlementLimit];
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export const clampToDataAccessDays = ({
  plan,
  fromTimestamp,
  now = new Date(),
}: {
  plan: Plan | null;
  fromTimestamp?: string | Date;
  now?: Date;
}): {
  accessFloor?: Date;
  effectiveFromTimestamp?: Date;
  wasClamped: boolean;
} => {
  const limitDays = hasEntitlementLimitBasedOnPlan({
    plan,
    entitlementLimit: "data-access-days",
  });
  const requestedFromTimestamp = fromTimestamp
    ? new Date(fromTimestamp)
    : undefined;

  if (limitDays === false) {
    return {
      accessFloor: undefined,
      effectiveFromTimestamp: requestedFromTimestamp,
      wasClamped: false,
    };
  }

  const accessFloor = new Date(
    now.getTime() - limitDays * MILLISECONDS_PER_DAY,
  );
  const wasClamped =
    !requestedFromTimestamp || requestedFromTimestamp < accessFloor;

  return {
    accessFloor,
    effectiveFromTimestamp: wasClamped ? accessFloor : requestedFromTimestamp,
    wasClamped,
  };
};
