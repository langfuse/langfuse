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
import {
  invalidateCachedOrgApiKeys,
  logger,
} from "@langfuse/shared/src/server";

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
  if (dbOrg.cloudConfig !== null && org.cloudConfig === null) {
    // parseDbOrg drops a config that fails the schema, which would hide any
    // paid billing state in it from the paid check below.
    logger.error(
      "[Enterprise trial] stored cloudConfig does not parse, refusing to start a trial",
      { orgId },
    );
    throw new LangfuseConflictError(
      "This organization's billing settings need a manual check. Contact support to start the trial.",
    );
  }
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

  // Merges only the trial into the stored value inside Postgres, so a write
  // that landed after the read is kept: a checkout claiming the CH
  // organization id uses raw SQL and leaves updated_at untouched. The guard on
  // an existing trial turns a concurrent second redemption into a no-op.
  // Clearing a free-tier WARNING lets the trial's own warning fire once usage
  // crosses its threshold; a block stays until the worker re-evaluates usage
  // against the trial cap.
  const count = await prisma.$executeRaw`
    UPDATE organizations
    SET cloud_config = jsonb_set(
          COALESCE(NULLIF(cloud_config, 'null'::jsonb), '{}'::jsonb),
          '{enterpriseTrial}',
          ${JSON.stringify(enterpriseTrial)}::jsonb,
          true
        ),
        cloud_free_tier_usage_threshold_state =
          NULLIF(cloud_free_tier_usage_threshold_state, 'WARNING'),
        updated_at = NOW()
    WHERE id = ${orgId}
      AND COALESCE(cloud_config -> 'enterpriseTrial', 'null'::jsonb) = 'null'::jsonb
  `;
  if (count === 0) {
    throw new LangfuseConflictError(
      "This organization has already used its enterprise trial.",
    );
  }

  // Cached API keys carry the org's plan; drop them so the public API picks
  // up the trial right away.
  await invalidateCachedOrgApiKeys(orgId);

  return enterpriseTrial;
}
