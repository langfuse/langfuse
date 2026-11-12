import { createHash, timingSafeEqual } from "crypto";
import {
  CloudConfigSchema,
  ENTERPRISE_TRIAL_DURATION_DAYS,
  hasPaidBillingState,
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  parseDbOrg,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { invalidateCachedOrgApiKeys } from "@langfuse/shared/src/server";

const DAY_MS = 24 * 60 * 60 * 1000;

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * Compares against every valid code in constant time. Hashing first gives both
 * sides of `timingSafeEqual` the same length, so the response time reveals
 * neither a partial match nor the length of a valid code.
 */
function matchesCouponCode(code: string, validCodes: string[]): boolean {
  const candidate = sha256(code.trim());
  return validCodes.reduce(
    (matched, validCode) =>
      timingSafeEqual(candidate, sha256(validCode)) || matched,
    false,
  );
}

/**
 * Puts an unpaid org on the enterprise trial when `code` is one of
 * `validCodes`. Each org gets one trial; orgs with paid billing state cannot
 * start one, because a paid plan outranks the trial anyway.
 */
export async function redeemEnterpriseTrial(params: {
  orgId: string;
  code: string;
  validCodes: string[];
  now?: Date;
}): Promise<{ startedAt: string; endsAt: string }> {
  const { orgId, code, validCodes, now = new Date() } = params;

  if (validCodes.length === 0) {
    throw new InvalidRequestError("Enterprise trials are not available.");
  }
  if (!matchesCouponCode(code, validCodes)) {
    throw new InvalidRequestError("This coupon code is not valid.");
  }

  const dbOrg = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!dbOrg) {
    throw new LangfuseNotFoundError("Organization not found.");
  }
  const org = parseDbOrg(dbOrg);
  if (org.cloudConfig?.enterpriseTrial) {
    throw new LangfuseConflictError(
      "This organization has already used its enterprise trial.",
    );
  }
  if (hasPaidBillingState(org)) {
    throw new LangfuseConflictError(
      "This organization is already on a paid plan.",
    );
  }

  const enterpriseTrial = CloudConfigSchema.shape.enterpriseTrial.parse({
    startedAt: now.toISOString(),
    endsAt: new Date(
      now.getTime() + ENTERPRISE_TRIAL_DURATION_DAYS * DAY_MS,
    ).toISOString(),
  });
  if (!enterpriseTrial) {
    throw new Error("Failed to build a valid enterprise trial");
  }

  // Guarded on updatedAt so a billing webhook that rewrote cloudConfig since
  // the read is not overwritten with the stale copy.
  const { count } = await prisma.organization.updateMany({
    where: { id: orgId, updatedAt: dbOrg.updatedAt },
    data: { cloudConfig: { ...org.cloudConfig, enterpriseTrial } },
  });
  if (count === 0) {
    throw new LangfuseConflictError(
      "The organization changed while starting the trial. Try again.",
    );
  }

  // Cached API keys carry the org's plan; drop them so the public API picks
  // up the trial right away.
  await invalidateCachedOrgApiKeys(orgId);

  return enterpriseTrial;
}
