import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  authenticatedProcedure,
} from "@/src/server/api/trpc";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  organizationFormSchema,
  organizationOptionalNameSchema,
} from "@/src/features/organizations/utils/organizationNameSchema";
import * as z from "zod";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac";
import { TRPCError } from "@trpc/server";
import { ApiAuthService } from "@/src/features/public-api/server";
import {
  getLastTraceTimestampsByProjects,
  isLangfuseAITracingConfigured,
  redis,
} from "@langfuse/shared/src/server";
import { resolveBillingService } from "@/src/ee/features/billing/server/resolveBillingService";
import { isCloudBillingEnabled } from "@/src/ee/features/billing/utils/isCloudBilling";
import { shouldAutoEnableV4 } from "@/src/features/events/lib/v4Rollout";
import { buildAdminOrgContext } from "@/src/features/organizations/server/adminOrgContext";
import { getSfdcService } from "@/src/ee/features/sfdc-sync/server";
import {
  featurePreviewFlags,
  filterFeaturePreviewFlags,
} from "@/src/features/feature-flags/available-flags";
import { setOrganizationFeatureFlagDefault } from "@/src/features/feature-flags/server/organizationFeatureFlags";
import { parseFlags } from "@/src/features/feature-flags/utils";

import { env } from "@/src/env.mjs";

export const organizationsRouter = createTRPCRouter({
  // Admin-only fallback for useOrganization: returns the org in the same shape
  // as session.user.organizations[number], since admins are not members of
  // customer orgs and have no session entry.
  byId: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx }) => {
      const organization = await buildAdminOrgContext(ctx);
      if (!organization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }
      return organization;
    }),
  lastTraceByProject: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx }) => {
      const organization =
        ctx.session.user.admin === true
          ? await buildAdminOrgContext(ctx)
          : ctx.session.user.organizations.find(
              (org) => org.id === ctx.session.orgId,
            );

      return getLastTraceTimestampsByProjects({
        projectIds: organization?.projects.map((project) => project.id) ?? [],
      });
    }),
  getFeatureFlagOrgDefaults: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });
      if (
        env.NEXT_PUBLIC_DEMO_ORG_ID &&
        input.orgId === env.NEXT_PUBLIC_DEMO_ORG_ID
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Feature preview defaults are unavailable for the demo organization",
        });
      }

      const organization = await ctx.prisma.organization.findUnique({
        where: { id: input.orgId },
        select: {
          featureFlagOrgDefaults: true,
          _count: { select: { organizationMemberships: true } },
        },
      });
      if (!organization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      return {
        defaults: filterFeaturePreviewFlags(
          organization.featureFlagOrgDefaults,
        ),
        memberCount: organization._count.organizationMemberships,
      };
    }),
  setFeatureFlagOrgDefault: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        flag: z.enum(featurePreviewFlags),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });
      if (
        env.NEXT_PUBLIC_DEMO_ORG_ID &&
        input.orgId === env.NEXT_PUBLIC_DEMO_ORG_ID
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Feature preview defaults are unavailable for the demo organization",
        });
      }

      if (
        input.enabled &&
        env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES !== "true"
      ) {
        const actor = await ctx.prisma.user.findUnique({
          where: { id: ctx.session.user.id },
          select: {
            email: true,
            featureFlags: true,
            v4BetaEnabled: true,
          },
        });
        const actorHasPreviewEnabled =
          actor !== null &&
          parseFlags(actor.featureFlags, {
            email: actor.email,
            v4BetaEnabled:
              ctx.session.user.v4BetaEnabled ?? actor.v4BetaEnabled,
          })[input.flag] === true;
        if (!actorHasPreviewEnabled) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Enable and test this preview in your personal Feature Preview settings before enabling it for the organization.",
          });
        }
      }

      const result = await setOrganizationFeatureFlagDefault({
        prisma: ctx.prisma,
        orgId: input.orgId,
        flag: input.flag,
        enabled: input.enabled,
      });

      await auditLog({
        session: ctx.session,
        resourceType: "organization",
        resourceId: input.orgId,
        action: "updateFeatureFlagDefault",
        before: { featureFlagOrgDefaults: result.before },
        after: { featureFlagOrgDefaults: result.after },
      });

      return {
        defaults: result.after,
        flag: input.flag,
        enabled: input.enabled,
      };
    }),
  create: authenticatedProcedure
    .input(organizationFormSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.session.user.canCreateOrganizations)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to create organizations",
        });

      const organization = await ctx.prisma.$transaction(async (tx) => {
        const organizationCountBeforeCreate =
          await tx.organizationMembership.count({
            where: {
              userId: ctx.session.user.id,
              ...(env.NEXT_PUBLIC_DEMO_ORG_ID
                ? { orgId: { not: env.NEXT_PUBLIC_DEMO_ORG_ID } }
                : {}),
            },
          });

        const organization = await tx.organization.create({
          data: {
            name: input.name,
            aiFeaturesEnabled: input.aiFeaturesEnabled,
            organizationMemberships: {
              create: {
                userId: ctx.session.user.id,
                role: "OWNER",
              },
            },
          },
        });

        if (organizationCountBeforeCreate === 0) {
          const isCloudDeployment = Boolean(
            env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
          );

          if (isCloudDeployment) {
            const userRolloutState = await tx.user.findUnique({
              where: { id: ctx.session.user.id },
              select: {
                createdAt: true,
                v4BetaEnabled: true,
                organizationMemberships: {
                  select: {
                    organization: {
                      select: {
                        id: true,
                        createdAt: true,
                      },
                    },
                  },
                },
              },
            });

            if (
              userRolloutState &&
              !userRolloutState.v4BetaEnabled &&
              shouldAutoEnableV4({
                userCreatedAt: userRolloutState.createdAt,
                organizations: userRolloutState.organizationMemberships.map(
                  (membership) => ({
                    id: membership.organization.id,
                    createdAt: membership.organization.createdAt,
                  }),
                ),
                excludedOrganizationIds: env.NEXT_PUBLIC_DEMO_ORG_ID
                  ? [env.NEXT_PUBLIC_DEMO_ORG_ID]
                  : [],
              })
            ) {
              // This path is both the normal first-org initialization and a
              // recovery path if signup-side initialization failed earlier.
              await tx.user.update({
                where: { id: ctx.session.user.id },
                data: { v4BetaEnabled: true },
              });
            }
          }
        }

        return organization;
      });
      await auditLog({
        resourceType: "organization",
        resourceId: organization.id,
        action: "create",
        orgId: organization.id,
        orgRole: "OWNER",
        userId: ctx.session.user.id,
        after: organization,
      });

      await getSfdcService()?.upsertOrg({
        orgId: organization.id,
        orgName: organization.name,
        createdAt: organization.createdAt,
        plan: "Hobby",
      });
      await getSfdcService()?.setUserRole({
        orgId: organization.id,
        userId: ctx.session.user.id,
        email: ctx.session.user.email,
        role: "OWNER",
      });

      return {
        id: organization.id,
        name: organization.name,
        role: "OWNER",
      };
    }),
  update: protectedOrganizationProcedure
    .input(
      organizationOptionalNameSchema
        .extend({
          orgId: z.string(),
          aiFeaturesEnabled: z.boolean().optional(),
          aiTelemetryEnabled: z.boolean().optional(),
        })
        .refine(
          (data) =>
            data.name ||
            data.aiFeaturesEnabled !== undefined ||
            data.aiTelemetryEnabled !== undefined,
          {
            message:
              "At least one of name, aiFeaturesEnabled or aiTelemetryEnabled is required",
          },
        ),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });

      if (input.aiTelemetryEnabled !== undefined) {
        if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "AI telemetry controls are only available on Langfuse Cloud.",
          });
        }

        if (!isLangfuseAITracingConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "AI telemetry controls are only available when the AI-features project is configured.",
          });
        }
      }

      const beforeOrganization = await ctx.prisma.organization.findFirst({
        where: {
          id: input.orgId,
        },
      });
      const afterOrganization = await ctx.prisma.organization.update({
        where: {
          id: input.orgId,
        },
        data: {
          name: input.name,
          aiFeaturesEnabled: input.aiFeaturesEnabled,
          aiTelemetryEnabled: input.aiTelemetryEnabled,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "organization",
        resourceId: input.orgId,
        action: "update",
        before: beforeOrganization,
        after: afterOrganization,
      });

      return true;
    }),
  delete: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:delete",
      });

      // count non-deleted projects
      const countNonDeletedProjects = await ctx.prisma.project.count({
        where: {
          orgId: input.orgId,
          deletedAt: null,
        },
      });

      // count all projects (including soft-deleted)
      const countAllProjects = await ctx.prisma.project.count({
        where: {
          orgId: input.orgId,
        },
      });

      if (countNonDeletedProjects > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Please delete or transfer all projects before deleting the organization.",
        });
      }

      if (countAllProjects > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Deletion of your projects is still being processed, please try deleting the organization later",
        });
      }

      // Attempt to cancel the billing subscription immediately (Cloud only) before deleting org
      if (isCloudBillingEnabled()) {
        try {
          const { service } = await resolveBillingService(ctx, input.orgId);
          await service.cancelImmediatelyAndInvoice(input.orgId);
        } catch (e) {
          // If billing cancellation fails for reasons other than no subscription, abort deletion
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Failed to cancel billing subscription prior to organization deletion",
            cause: e as Error,
          });
        }
      }

      // Evict before the delete: ApiKey.organization cascades, so keys are gone
      // by the time a post-delete eviction would run and it would find nothing.
      await new ApiAuthService(ctx.prisma, redis).invalidateCachedOrgApiKeys(
        input.orgId,
      );

      const organization = await ctx.prisma.organization.delete({
        where: {
          id: input.orgId,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "organization",
        resourceId: input.orgId,
        action: "delete",
        before: organization,
      });

      return true;
    }),
});
