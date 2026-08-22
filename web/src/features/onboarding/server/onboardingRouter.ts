import { z } from "zod";
import {
  completeSignupOnboarding,
  getSignupOnboardingStatus,
} from "@/src/features/onboarding/server/onboardingService";
import {
  isNewsletterSignupAvailable,
  subscribeToNewsletter,
} from "@/src/features/onboarding/server/newsletterService";
import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";

export const onboardingRouter = createTRPCRouter({
  status: authenticatedProcedure.query(async ({ ctx }) => {
    return getSignupOnboardingStatus({
      prisma: ctx.prisma,
      userId: ctx.session.user.id,
      canCreateOrganizations: ctx.session.user.canCreateOrganizations,
    });
  }),

  // Whether to render the self-hosting newsletter step. Reflects deployment
  // configuration only — whether the signup proxy is actually reachable is
  // discovered on submit rather than probed here.
  newsletterStatus: authenticatedProcedure.query(() => ({
    available: isNewsletterSignupAvailable(),
  })),

  subscribeToNewsletter: authenticatedProcedure
    .input(z.object({ email: z.string().trim().max(320).pipe(z.email()) }))
    .mutation(async ({ input }) => ({
      status: await subscribeToNewsletter({ email: input.email }),
    })),

  complete: authenticatedProcedure
    .input(
      z
        .object({
          referralSource: z.string().trim().max(500).optional(),
          newsletterOptIn: z.boolean().optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      return completeSignupOnboarding({
        prisma: ctx.prisma,
        userId: ctx.session.user.id,
        userEmail: ctx.session.user.email,
        canCreateOrganizations: ctx.session.user.canCreateOrganizations,
        referralSource: input?.referralSource,
        newsletterOptIn: input?.newsletterOptIn,
      });
    }),
});
