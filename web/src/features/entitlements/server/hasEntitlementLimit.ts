import {
  entitlementAccess,
  type EntitlementLimit,
} from "@/src/features/entitlements/constants/entitlements";
import { type Plan } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";

type HasEntitlementLimitParams = {
  entitlementLimit: EntitlementLimit;
  sessionUser: NonNullable<Session["user"]>;
} & ({ projectId: string } | { orgId: string });

/**
 * Get the limit for a specific entitlement based on the session user (to be used server-side).
 * @returns false if unlimited, or a number representing the limit
 */
export const hasEntitlementLimit = (
  p: HasEntitlementLimitParams,
): number | false => {
  if (p.sessionUser.admin) return false; // Admins have unlimited access

  const org =
    "projectId" in p
      ? p.sessionUser.organizations.find((org) =>
          org.projects.some((proj) => proj.id === p.projectId),
        )
      : p.sessionUser.organizations.find((org) => org.id === p.orgId);

  const plan = org?.plan ?? "oss";
  return hasEntitlementLimitBasedOnPlan({
    plan,
    entitlementLimit: p.entitlementLimit,
  });
};

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

/**
 * Check if a specific usage is within the entitlement limit
 * @returns true if usage is allowed, false if it exceeds the limit
 */
const isWithinEntitlementLimit = (
  p: HasEntitlementLimitParams & { currentUsage: number },
): boolean => {
  const limit = hasEntitlementLimit(p);
  if (limit === false) return true; // No limit
  return p.currentUsage < limit;
};

/**
 * Throws if usage exceeds the entitlement limit
 */
export const throwIfExceedsLimit = (
  p: HasEntitlementLimitParams & { currentUsage: number },
) => {
  if (!isWithinEntitlementLimit(p)) {
    const limit = hasEntitlementLimit(p);
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Usage (${p.currentUsage}) exceeds the limit (${limit}) for entitlement: ${p.entitlementLimit}`,
    });
  }
};
