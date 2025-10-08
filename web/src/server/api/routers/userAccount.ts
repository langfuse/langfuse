import { z } from "zod/v4";
import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { StringNoHTML } from "@langfuse/shared";
import { Role } from "@langfuse/shared/src/db";

const updateDisplayNameSchema = z.object({
  name: StringNoHTML.min(1, "Name cannot be empty").max(
    100,
    "Name must be at most 100 characters",
  ),
});

export const userAccountRouter = createTRPCRouter({
  checkCanDelete: authenticatedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Find all organizations where user is a member
    const organizationMemberships =
      await ctx.prisma.organizationMembership.findMany({
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
        const ownerCount =
          membership.organization.organizationMemberships.length;
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

    // First, verify user can be deleted
    const organizationMemberships =
      await ctx.prisma.organizationMembership.findMany({
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

    const organizationsWhereLastOwner = organizationMemberships.filter(
      (membership) =>
        membership.organization.organizationMemberships.length === 1,
    );

    if (organizationsWhereLastOwner.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Cannot delete account. You are the last owner of one or more organizations. Please add another owner or delete the organizations first.",
      });
    }

    // Delete the user (cascade will handle related records)
    await ctx.prisma.user.delete({
      where: { id: userId },
    });

    return {
      success: true,
    };
  }),
});
