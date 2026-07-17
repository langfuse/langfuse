import { CloudConfigSchema, type ParsedOrganization } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { getSfdcService, toSfdcPlan } from "./sfdcService";

/**
 * Push a plan change to SFDC (fire-and-forget, never throws — the underlying
 * SfdcService swallows all errors). Compares the entitlement plan resolved
 * from the org's cloudConfig before vs. after a billing update and only syncs
 * when it actually changed — Stripe subscription events also fire for monthly
 * invoice cycling and payment-status flaps, which must not spam Mulesoft.
 *
 * `billingCycleAnchor` doubles as the Hobby→paid conversion date: it is set
 * from the org's paid subscription and stable across plan switches, but NOT
 * across churn-and-resubscribe — subscription deletion resets the anchor and
 * a later resubscription re-anchors it, so the pushed value tracks the MOST
 * RECENT Hobby→paid conversion and overwrites the SFDC field on each paid
 * push. It is omitted on downgrades to Hobby (SFDC keeps the previously
 * written value). Orgs on a manual cloudConfig.plan override never reach the
 * push: the override wins plan resolution on both sides of the comparison,
 * so their resolved plan cannot change here — sales owns those SFDC records.
 */
export async function syncOrgPlanChangeToSfdc(args: {
  orgBeforeUpdate: Pick<
    ParsedOrganization,
    "id" | "name" | "createdAt" | "cloudConfig"
  >;
  /** The org's cloudConfig as persisted by the billing update. */
  updatedCloudConfig: unknown;
  /** Anchor consistent with the update that was just persisted. */
  billingCycleAnchor: Date | null;
}): Promise<void> {
  const { orgBeforeUpdate, updatedCloudConfig, billingCycleAnchor } = args;

  const planBefore = getOrganizationPlanServerSide(
    orgBeforeUpdate.cloudConfig ?? undefined,
  );
  const parsedUpdated = CloudConfigSchema.safeParse(updatedCloudConfig);
  if (!parsedUpdated.success) {
    // Never guess a plan from an unparsable config — skipping only delays
    // the SFDC tier update until the next real plan change.
    logger.error(
      "[SFDC] could not parse updated cloudConfig for plan sync — skipping",
      { orgId: orgBeforeUpdate.id, error: parsedUpdated.error.message },
    );
    return;
  }
  const planAfter = getOrganizationPlanServerSide(parsedUpdated.data);
  if (planBefore === planAfter) return;

  const sfdcPlan = toSfdcPlan(planAfter);
  if (!sfdcPlan) return; // non-cloud plan — cannot happen on Cloud

  await getSfdcService()?.upsertOrg({
    orgId: orgBeforeUpdate.id,
    orgName: orgBeforeUpdate.name,
    createdAt: orgBeforeUpdate.createdAt,
    plan: sfdcPlan,
    convertedToPaidAt:
      planAfter !== "cloud:hobby" ? billingCycleAnchor : undefined,
  });
}
