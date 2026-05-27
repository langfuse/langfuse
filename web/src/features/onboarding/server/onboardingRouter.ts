import { resolveOnboardingRedirectTarget } from "@/src/features/onboarding/server/onboardingService";
import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";

export const onboardingRouter = createTRPCRouter({
  complete: authenticatedProcedure.mutation(async ({ ctx }) => {
    const existingTarget = await resolveOnboardingRedirectTarget({
      prisma: ctx.prisma,
      userId: ctx.session.user.id,
    });

    if (existingTarget) {
      return existingTarget;
    }

    return {
      redirectTo: ctx.session.user.canCreateOrganizations ? "/setup" : "/",
    };
  }),
});
