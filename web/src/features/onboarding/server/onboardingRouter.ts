import {
  getRealOrganizationMemberships,
  resolveOnboardingRedirectTarget,
} from "@/src/features/onboarding/server/onboardingService";
import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";

export const onboardingRouter = createTRPCRouter({
  complete: authenticatedProcedure.mutation(async ({ ctx }) => {
    const realOrganizationMemberships = await getRealOrganizationMemberships({
      prisma: ctx.prisma,
      userId: ctx.session.user.id,
    });

    const existingTarget = resolveOnboardingRedirectTarget({
      organizationMemberships: realOrganizationMemberships,
    });

    if (existingTarget) {
      return existingTarget;
    }

    return {
      redirectTo: ctx.session.user.canCreateOrganizations ? "/setup" : "/",
    };
  }),
});
