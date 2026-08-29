import { TRPCError } from "@trpc/server";

import { env } from "@/src/env.mjs";
import { type OrgAuthedContext } from "@/src/server/api/trpc";
import {
  type BillingProvider,
  getBillingProvider,
  parseDbOrg,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

import { getChbApiClient } from "./chb/chbApiClient";
import { ChbBillingService } from "./chb/chbBillingService";
import { createBillingServiceFromContext } from "./stripe/stripeBillingService";

export type CloudBillingService =
  | ReturnType<typeof createBillingServiceFromContext>
  | ChbBillingService;

/**
 * Provider-dispatching billing service factory.
 *
 * Resolves the org's billing provider via the shared `getBillingProvider`
 * and returns the matching service — the untouched Stripe `BillingService`
 * for Stripe orgs, `ChbBillingService` for CHB orgs. The ten
 * `cloudBillingRouter` procedures keep their names, inputs, and output
 * shapes, so the tRPC contract does not change.
 *
 * Fail-closed guard: when the CHB cutoff is set but the CHB REST env is
 * incomplete, cutoff-routed orgs (no CHB state yet) fall back to Stripe —
 * never a half-configured CHB flow. Orgs already carrying CHB state cannot be
 * served by Stripe and error instead.
 *
 * This dispatch is also the structural interlock that keeps Stripe checkout
 * unreachable for any org holding a `cloudConfig.clickhouse` block: such
 * orgs always resolve to the CHB service.
 */
export const resolveBillingService = async (
  ctx: OrgAuthedContext,
  orgId: string,
): Promise<{
  billingProvider: BillingProvider;
  service: CloudBillingService;
}> => {
  const org = await ctx.prisma.organization.findUnique({
    where: { id: orgId },
  });
  if (!org) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Organization not found",
    });
  }
  const parsedOrg = parseDbOrg(org);
  // The cutoff is injected rather than read inside the resolver: the shared
  // module is exported from the client-safe barrel, so web passes the value from
  // its own validated env schema.
  const cutoff = env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE;
  const billingProvider = getBillingProvider(parsedOrg, { cutoff });

  if (billingProvider === "clickhouse") {
    // Shared process-wide, so every billing request reuses one Auth0 token
    // cache rather than minting a token per request.
    const client = getChbApiClient();
    if (!client) {
      if (parsedOrg.cloudConfig?.clickhouse?.organizationId) {
        // Sticky CHB org: Stripe cannot serve it, this is a config error
        logger.error(
          `resolveBillingService: org ${orgId} is CHB-billed but the CHB REST env is not configured`,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "ClickHouse Billing is not configured on this deployment",
        });
      }
      // Cutoff-routed org without CHB state: fail closed to Stripe
      if (cutoff) {
        logger.error(
          "resolveBillingService: LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE is set but the CHB REST env is incomplete — treating the cutoff as unset (fail closed to Stripe)",
        );
      }
      return {
        billingProvider: "stripe",
        service: createBillingServiceFromContext(ctx),
      };
    }
    return {
      billingProvider: "clickhouse",
      service: new ChbBillingService(client, ctx),
    };
  }

  return {
    billingProvider: "stripe",
    service: createBillingServiceFromContext(ctx),
  };
};
