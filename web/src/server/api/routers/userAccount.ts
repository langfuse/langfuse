import { z } from "zod";
import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { ForbiddenError, StringNoHTML } from "@langfuse/shared";
import { Role, type Prisma, type PrismaClient } from "@langfuse/shared/src/db";
import { canToggleV4 } from "@/src/features/events/server";
import { V4_PREVIEW_LABEL } from "@/src/features/events/lib/v4PreviewLabel";
import { env } from "@/src/env.mjs";
import { ContextResolver } from "@/src/features/auth/policy/contextResolver";
import { removeUserFromAllOrgs } from "@/src/features/memberships/server/membershipService";
import {
  isAdminOnlyFeaturePreviewFlag,
  personalFeaturePreviewFlags,
  setUserFeaturePreview,
  hasInternalAccess,
  INTERNAL_FEATURE_FLAG,
} from "@/src/features/feature-flags/server";
import { advanceSessionsExpiredAtForUser } from "@/src/features/auth/lib/sessionExpiration";

const updateDisplayNameSchema = z.object({
  name: StringNoHTML.min(1, "Name cannot be empty").max(
    100,
    "Name must be at most 100 characters",
  ),
});

/**
 * Helper function to check if a user can be deleted.
 * A user can only be deleted if they are not the last owner of any organization.
 */
async function checkUserCanBeDeleted(
  userId: string,
  prisma:
    | Omit<
        PrismaClient,
        | "$connect"
        | "$disconnect"
        | "$on"
        | "$transaction"
        | "$use"
        | "$extends"
      >
    | Prisma.TransactionClient,
) {
  // Find all organizations where user is an owner
  const organizationMemberships = await prisma.organizationMembership.findMany({
    where: {
      userId,
      role: Role.OWNER,
    },
    include: {
      organization: {
        include: {
          organizationMemberships: {
            where: {
              role: Role.OWNER,
            },
          },
        },
      },
    },
  });

  // Filter to find organizations where user is the ONLY owner
  const organizationsWhereLastOwner = organizationMemberships
    .filter((membership) => {
      const ownerCount = membership.organization.organizationMemberships.length;
      return ownerCount === 1; // User is the only owner
    })
    .map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
    }));

  return {
    canDelete: organizationsWhereLastOwner.length === 0,
    blockingOrganizations: organizationsWhereLastOwner,
  };
}

export const userAccountRouter = createTRPCRouter({
  setViewMode: authenticatedProcedure
    .input(z.object({ mode: z.enum(["INTERNAL", "EXTERNAL"]) }))
    .mutation(async ({ input, ctx }) => {
      const canEnableFeaturePreviews =
        Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) ||
        ctx.session.user.v4BetaEnabled === true;

      if (
        !hasInternalAccess({
          isAdmin: ctx.session.user.admin === true,
          isExperimentalFeaturesEnabled:
            env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES === "true",
        }) ||
        !canEnableFeaturePreviews
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Internal view mode requires ${V4_PREVIEW_LABEL} on self-hosted deployments.`,
        });
      }
      await setUserFeaturePreview({
        prisma: ctx.prisma,
        userId: ctx.session.user.id,
        flag: INTERNAL_FEATURE_FLAG,
        enabled: input.mode === "INTERNAL",
      });
      return { success: true };
    }),
  checkCanDelete: authenticatedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    return checkUserCanBeDeleted(userId, ctx.prisma);
  }),

  updateDisplayName: authenticatedProcedure
    .input(updateDisplayNameSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const updatedUser = await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          name: input.name,
        },
      });

      return {
        success: true,
        name: updatedUser.name,
      };
    }),

  signOutAllSessions: authenticatedProcedure.mutation(async ({ ctx }) => {
    await advanceSessionsExpiredAtForUser(ctx.session.user.id, ctx.prisma);

    return { success: true };
  }),

  setFeaturePreviewEnabled: authenticatedProcedure
    .input(
      z.object({
        // Allowlist of user-toggleable Feature Preview flags (the Feature
        // Preview modal). Keep in sync with the modal's preview registry.
        flag: z.enum(personalFeaturePreviewFlags),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      if (
        isAdminOnlyFeaturePreviewFlag(input.flag) &&
        !ctx.session.user.admin
      ) {
        throw new ForbiddenError(
          "Only administrators can change this feature preview.",
        );
      }

      const canEnableFeaturePreviews =
        Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) ||
        ctx.session.user.v4BetaEnabled === true;

      if (
        input.enabled &&
        !isAdminOnlyFeaturePreviewFlag(input.flag) &&
        !canEnableFeaturePreviews
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Feature previews require ${V4_PREVIEW_LABEL} on self-hosted deployments.`,
        });
      }

      // The helper serializes and retries the read-modify-write so parallel
      // toggles of different flags cannot silently drop one another.
      await setUserFeaturePreview({
        prisma: ctx.prisma,
        userId,
        flag: input.flag,
        enabled: input.enabled,
      });

      return {
        success: true,
        flag: input.flag,
        enabled: input.enabled,
      };
    }),

  delete: authenticatedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    await removeUserFromAllOrgs(
      await new ContextResolver().resolveUser({
        userId,
        isPlatformAdmin: false,
      }),
      userId,
    );
    await ctx.prisma.user.delete({
      where: { id: userId },
    });

    return {
      success: true,
    };
  }),

  setV4BetaEnabled: authenticatedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // Mirror the V4 preview gating in the auth.ts session callback so the
      // write path agrees with what the session reports. Availability is
      // driven by the write mode.
      const v4WriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
      const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

      // In events_only mode the preview is mandatory and cannot be toggled off:
      // the legacy tables it would fall back to are no longer written. Ignore
      // the requested value so a stale client can't flip a user into broken
      // reads, and keep the returned session shape consistent with auth.ts.
      if (v4WriteMode === "events_only") {
        return {
          success: true,
          v4BetaEnabled: true,
          canToggleV4: false,
        };
      }

      // In legacy mode the events tables are not written, so the preview has
      // nothing correct to read — it stays off and cannot be toggled.
      if (v4WriteMode === "legacy") {
        return {
          success: true,
          v4BetaEnabled: false,
          canToggleV4: false,
        };
      }

      // dual mode. On Cloud the date-based rollout applies (handled below) —
      // users auto-enabled by the rollout are locked on and cannot toggle off.
      // Self-hosted deployments are opt-in, but only once they have also set
      // ALLOW_PREVIEW_OPT_IN=true; otherwise feature paths still gated on that
      // flag would fall back to legacy tables while the core UI reads events,
      // so the toggle is not offered (mirrors the auth.ts session callback).
      if (!isLangfuseCloud) {
        if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true") {
          return {
            success: true,
            v4BetaEnabled: false,
            canToggleV4: false,
          };
        }

        await ctx.prisma.user.update({
          where: { id: ctx.session.user.id },
          data: { v4BetaEnabled: input.enabled },
        });

        return {
          success: true,
          v4BetaEnabled: input.enabled,
          canToggleV4: true,
        };
      }

      const userRolloutState = await ctx.prisma.user.findUnique({
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

      if (!userRolloutState) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const userCanToggleV4 = canToggleV4(
        {
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
        },
        { isLangfuseCloudAdmin: ctx.session.user.admin === true },
      );

      if (!userCanToggleV4) {
        return {
          success: true,
          v4BetaEnabled: userRolloutState.v4BetaEnabled,
          canToggleV4: false,
        };
      }

      await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { v4BetaEnabled: input.enabled },
      });

      return {
        success: true,
        v4BetaEnabled: input.enabled,
        canToggleV4: true,
      };
    }),
});
