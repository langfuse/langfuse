import { TRPCError } from "@trpc/server";
import {
  clearStarterProjectInvitePrompt,
  shouldShowStarterProjectInvitePrompt,
} from "@/src/features/onboarding/lib/starterProjectMetadata";
import {
  getRealOrganizationMemberships,
  resolveOnboardingRedirectTarget,
} from "@/src/features/onboarding/server/onboardingService";
import {
  createTRPCRouter,
  authenticatedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { z } from "zod";

export const onboardingRouter = createTRPCRouter({
  complete: authenticatedProcedure.mutation(async ({ ctx }) => {
    const realOrganizationMemberships = await getRealOrganizationMemberships({
      prisma: ctx.prisma,
      userId: ctx.session.user.id,
    });

    const existingTarget = resolveOnboardingRedirectTarget({
      organizationMemberships: realOrganizationMemberships,
      userId: ctx.session.user.id,
    });

    if (existingTarget) {
      return existingTarget;
    }

    return {
      organizationId: null,
      projectId: null,
      redirectTo: ctx.session.user.canCreateOrganizations ? "/setup" : "/",
      showStarterProjectInvitePrompt: false,
    };
  }),

  consumeStarterProjectInvitePrompt: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({
        where: {
          id: input.projectId,
          orgId: ctx.session.orgId,
        },
        select: {
          metadata: true,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const shouldClearPrompt = shouldShowStarterProjectInvitePrompt({
        metadata: project.metadata,
        userId: ctx.session.user.id,
      });

      if (!shouldClearPrompt) {
        return {
          updated: false,
        };
      }

      await ctx.prisma.project.update({
        where: {
          id: input.projectId,
          orgId: ctx.session.orgId,
        },
        data: {
          metadata: clearStarterProjectInvitePrompt({
            metadata: project.metadata,
            userId: ctx.session.user.id,
          }),
        },
      });

      return {
        updated: true,
      };
    }),
});
