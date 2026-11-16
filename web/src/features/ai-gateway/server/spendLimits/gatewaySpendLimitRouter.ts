import { z } from "zod/v4";
import { GatewaySpendLimitInterval } from "@langfuse/shared/src/db";

import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import {
  getGatewayUsageScope,
  requireGatewayAdmin,
  requireGatewayInvoke,
} from "../gatewayAccess";
import { getKeyOwnerFilter } from "../gatewayUsageScope";
import { GatewaySpendLimitService } from "./gatewaySpendLimitService";
import { GatewaySpendLimitScopeSchema } from "./gatewaySpendLimitScope";

const organizationInput = z.object({ orgId: z.string() });
const spendLimitInput = organizationInput.extend({ id: z.string() });
const limitUsdSchema = z.number().positive().max(1_000_000_000);

export const gatewaySpendLimitRouter = createTRPCRouter({
  /** `available` is false while gateway requests are not recorded; limits then cannot be created, changed or reset. */
  list: protectedOrganizationProcedure
    .input(organizationInput.extend({ scope: GatewaySpendLimitScopeSchema }))
    .query(async ({ input, ctx }) => {
      requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      const usageScope = getGatewayUsageScope({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewaySpendLimitService(ctx.prisma).list({
        organizationId: input.orgId,
        ownerUserId: getKeyOwnerFilter(usageScope),
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
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewaySpendLimitService(ctx.prisma).create({
        organizationId: input.orgId,
        scope: input.scope,
        interval: input.interval,
        limitUsd: input.limitUsd,
        session: ctx.session,
      });
    }),

  update: protectedOrganizationProcedure
    .input(spendLimitInput.extend({ limitUsd: limitUsdSchema }))
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewaySpendLimitService(ctx.prisma).update({
        organizationId: input.orgId,
        id: input.id,
        limitUsd: input.limitUsd,
        session: ctx.session,
      });
    }),

  reset: protectedOrganizationProcedure
    .input(spendLimitInput)
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewaySpendLimitService(ctx.prisma).reset({
        organizationId: input.orgId,
        id: input.id,
        session: ctx.session,
      });
    }),

  delete: protectedOrganizationProcedure
    .input(spendLimitInput)
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      await new GatewaySpendLimitService(ctx.prisma).delete({
        organizationId: input.orgId,
        id: input.id,
        session: ctx.session,
      });
      return { success: true };
    }),
});
