import * as z from "zod";
import { SurveyName } from "@prisma/client";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import {
  authenticatedProcedure,
  createTRPCRouter,
} from "@/src/server/api/trpc";
import { ensureStarterWorkspace } from "@/src/features/onboarding/server/ensureStarterWorkspace";

const onboardingCompleteSchema = z.object({
  response: z.record(z.string(), z.string()),
});

export const onboardingRouter = createTRPCRouter({
  ensureStarterWorkspace: authenticatedProcedure.mutation(async ({ ctx }) => {
    try {
      const result = await ensureStarterWorkspace({
        prisma: ctx.prisma,
        userId: ctx.session.user.id,
        canCreateOrganizations: ctx.session.user.canCreateOrganizations,
      });

      return {
        starterOrganizationId: result.starterOrganizationId,
        starterProjectId: result.starterProjectId,
        shouldShowInvitePrompt: Boolean(result.starterProjectId),
      };
    } catch (error) {
      logger.error("Failed to ensure starter workspace", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to ensure starter workspace",
      });
    }
  }),
  complete: authenticatedProcedure
    .input(onboardingCompleteSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await ensureStarterWorkspace({
          prisma: ctx.prisma,
          userId: ctx.session.user.id,
          canCreateOrganizations: ctx.session.user.canCreateOrganizations,
        });

        try {
          await ctx.prisma.survey.create({
            data: {
              surveyName: SurveyName.USER_ONBOARDING,
              response: input.response,
              userId: ctx.session.user.id,
              userEmail: ctx.session.user.email ?? undefined,
              orgId: result.organizationId ?? undefined,
            },
          });
        } catch (error) {
          logger.error("Failed to save onboarding survey", error);
        }

        return {
          starterOrganizationId: result.starterOrganizationId,
          starterProjectId: result.starterProjectId,
          shouldShowInvitePrompt: Boolean(result.starterProjectId),
        };
      } catch (error) {
        logger.error("Failed to complete onboarding", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to complete onboarding",
        });
      }
    }),
});
