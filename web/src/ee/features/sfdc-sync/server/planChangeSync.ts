import { CloudConfigSchema, type ParsedOrganization } from "@langfuse/shared";
import { prisma, Role } from "@langfuse/shared/src/db";
import { logger, traceException } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server";
import { deriveLeadSourceFromMemberships } from "./leadSource";
import { getSfdcService, toSfdcPlan, type SfdcService } from "./sfdcService";

/**
 * Since the live sync went live on Cloud (late June 2026), every org has had
 * its members linked in SFDC as the memberships were created. Older orgs were
 * linked only by the historical backfill, which skipped orgs that were on
 * Hobby at the time. Set a few days after go-live: a later cutoff only
 * re-sends idempotent events, an earlier one would miss orgs.
 */
const SFDC_LIVE_SYNC_STARTED_AT = new Date("2026-07-01T00:00:00Z");

/**
 * Push a plan change to SFDC (fire-and-forget, never throws — the underlying
 * SfdcService swallows all errors, and the member re-link catches its own).
 * Compares the entitlement plan resolved from the org's cloudConfig before
 * vs. after a billing update and only syncs when it actually changed — Stripe
 * subscription events also fire for monthly invoice cycling and
 * payment-status flaps, which must not spam Mulesoft.
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
 *
 * When an org created before the live sync leaves Hobby, its current members
 * are linked as well, since neither the live sync nor the backfill may ever
 * have linked them.
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

  const sfdc = getSfdcService();
  if (!sfdc) return;

  const accountOk = await sfdc.upsertOrg({
    orgId: orgBeforeUpdate.id,
    orgName: orgBeforeUpdate.name,
    createdAt: orgBeforeUpdate.createdAt,
    plan: sfdcPlan,
    convertedToPaidAt:
      planAfter !== "cloud:hobby" ? billingCycleAnchor : undefined,
  });

  // Member bridges need the Account, so they wait for its 2xx.
  if (
    accountOk &&
    planBefore === "cloud:hobby" &&
    orgBeforeUpdate.createdAt < SFDC_LIVE_SYNC_STARTED_AT
  ) {
    await linkExistingMembersToSfdc(sfdc, orgBeforeUpdate.id);
  }
}

/**
 * Replays the backfill's member steps for one org: a Lead for every member
 * who signed up before the live sync (later signups got theirs at signup),
 * then the org-member bridge for every member. A member whose Lead was not
 * delivered gets no bridge, since SFDC needs the Lead first.
 */
async function linkExistingMembersToSfdc(
  sfdc: SfdcService,
  orgId: string,
): Promise<void> {
  try {
    const members = await prisma.organizationMembership.findMany({
      where: {
        orgId,
        role: { not: Role.NONE },
        user: { email: { not: null } },
      },
      select: {
        userId: true,
        role: true,
        user: { select: { email: true, name: true, createdAt: true } },
      },
    });
    const excludeOrgIds = env.NEXT_PUBLIC_DEMO_ORG_ID
      ? [env.NEXT_PUBLIC_DEMO_ORG_ID]
      : [];

    await Promise.all(
      members.map(async ({ userId, role, user }) => {
        if (user.createdAt < SFDC_LIVE_SYNC_STARTED_AT) {
          const leadOk = await sfdc.upsertUser({
            userId,
            email: user.email,
            name: user.name,
            createdAt: user.createdAt,
            leadSource: await deriveLeadSourceFromMemberships(
              userId,
              excludeOrgIds,
            ),
          });
          if (!leadOk) return;
        }
        await sfdc.setUserRole({ orgId, userId, email: user.email, role });
      }),
    );
  } catch (err) {
    traceException(err);
    logger.error("[SFDC] failed to link existing members after plan change", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
