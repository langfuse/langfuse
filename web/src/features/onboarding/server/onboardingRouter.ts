import { z } from "zod";
import {
  completeCloudSignupOnboarding,
  getCloudSignupOnboardingStatus,
} from "@/src/features/onboarding/server/onboardingService";
import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";

export const onboardingRouter = createTRPCRouter({
  status: authenticatedProcedure.query(async ({ ctx }) => {
    return getCloudSignupOnboardingStatus({
      prisma: ctx.prisma,
      userId: ctx.session.user.id,
      canCreateOrganizations: ctx.session.user.canCreateOrganizations,
    });
  }),

  complete: authenticatedProcedure
    .input(
      z
        .object({
          referralSource: z.string().trim().max(500).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      return completeCloudSignupOnboarding({
        prisma: ctx.prisma,
        userId: ctx.session.user.id,
        userEmail: ctx.session.user.email,
        canCreateOrganizations: ctx.session.user.canCreateOrganizations,
        referralSource: input?.referralSource,
      });
    }),
});
