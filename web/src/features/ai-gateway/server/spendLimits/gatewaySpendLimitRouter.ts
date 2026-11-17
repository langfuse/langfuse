import { z } from "zod/v4";
import { GatewaySpendLimitInterval } from "@langfuse/shared/src/db";

import { GATEWAY_SPEND_BUDGET_MAX_USD } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";

import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  type AuthedSession,
} from "@/src/server/api/trpc";
import { getGatewayUsageScope, requireGatewayInvoke } from "../gatewayAccess";
import { GatewaySpendLimitService } from "./gatewaySpendLimitService";
import { GatewaySpendLimitScopeSchema } from "./gatewaySpendLimitScope";

const organizationInput = z.object({ orgId: z.string() });
const spendLimitInput = organizationInput.extend({ id: z.string() });
const limitUsdSchema = z.number().positive().max(GATEWAY_SPEND_BUDGET_MAX_USD);

/** A key's single spend limit, as set together with the key. */
export const gatewayApiKeySpendLimitInput = z.object({
  interval: z.enum(GatewaySpendLimitInterval),
  limitUsd: limitUsdSchema,
});

/** Admits gateway members; managers act on every limit, others on their own keys and the limits they created. */
function authorize(params: { session: AuthedSession; orgId: string }) {
  requireGatewayInvoke(params);
  return {
    organizationId: params.orgId,
    usageScope: getGatewayUsageScope(params),
  };
}

export const gatewaySpendLimitRouter = createTRPCRouter({
  /** `available` is false while gateway requests are not recorded; limits then cannot be created, changed or reset. */
  list: protectedOrganizationProcedure
    .input(organizationInput.extend({ scope: GatewaySpendLimitScopeSchema }))
    .query(async ({ input, ctx }) => {
      return new GatewaySpendLimitService(ctx.prisma).list({
        ...authorize({ session: ctx.session, orgId: input.orgId }),
        scope: input.scope,
      });
    }),

  create: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        scope: GatewaySpendLimitScopeSchema,
        interval: z.enum(GatewaySpendLimitInterval),
        limitUsd: limitUsdSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return new GatewaySpendLimitService(ctx.prisma).create({
        ...authorize({ session: ctx.session, orgId: input.orgId }),
        scope: input.scope,
        interval: input.interval,
        limitUsd: input.limitUsd,
        session: ctx.session,
      });
    }),

  update: protectedOrganizationProcedure
    .input(spendLimitInput.extend({ limitUsd: limitUsdSchema }))
    .mutation(async ({ input, ctx }) => {
      return new GatewaySpendLimitService(ctx.prisma).update({
        ...authorize({ session: ctx.session, orgId: input.orgId }),
        id: input.id,
        limitUsd: input.limitUsd,
        session: ctx.session,
      });
    }),

  reset: protectedOrganizationProcedure
    .input(spendLimitInput)
    .mutation(async ({ input, ctx }) => {
      return new GatewaySpendLimitService(ctx.prisma).reset({
        ...authorize({ session: ctx.session, orgId: input.orgId }),
        id: input.id,
        session: ctx.session,
      });
    }),

  delete: protectedOrganizationProcedure
    .input(spendLimitInput)
    .mutation(async ({ input, ctx }) => {
      await new GatewaySpendLimitService(ctx.prisma).delete({
        ...authorize({ session: ctx.session, orgId: input.orgId }),
        id: input.id,
        session: ctx.session,
      });
      return { success: true };
    }),
});
