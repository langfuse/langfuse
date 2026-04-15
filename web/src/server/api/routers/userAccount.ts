import { z } from "zod";
import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { StringNoHTML } from "@langfuse/shared";
import { Role, Prisma } from "@langfuse/shared/src/db";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { canToggleV4 } from "@/src/features/events/lib/v4Rollout";
import { env } from "@/src/env.mjs";

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

  delete: authenticatedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Wrap check and delete in a serializable transaction to prevent race conditions
    // when organization owners are removed concurrently
    await ctx.prisma.$transaction(
      async (tx) => {
        // Verify user can be deleted
        const { canDelete } = await checkUserCanBeDeleted(userId, tx);

        if (!canDelete) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Cannot delete account. You are the last owner of one or more organizations. Please add another owner or delete the organizations first.",
          });
        }

        // Delete the user (cascade will handle related records)
        await tx.user.delete({
          where: { id: userId },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return {
      success: true,
    };
  }),

  setV4BetaEnabled: authenticatedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const isCloudDeployment = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

      if (!isCloudDeployment) {
        return {
          success: true,
          v4BetaEnabled: false,
          canToggleV4: false,
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

      const userCanToggleV4 = canToggleV4({
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
      });

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
