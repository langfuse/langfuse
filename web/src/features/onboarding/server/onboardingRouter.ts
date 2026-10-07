import { z } from "zod";
import {
  completeCloudSignupOnboarding,
  getCloudSignupOnboardingStatus,
} from "@/src/features/onboarding/server/onboardingService";
import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";
import {
  BUILD_INTENT_IDS,
  BUILD_INTENT_MAX_SELECTIONS,
  BUILD_INTENT_OTHER_MAX_LENGTH,
  EXCLUSIVE_BUILD_INTENT,
} from "@/src/features/onboarding/lib/buildIntent";

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
          aiFeaturesEnabled: z.boolean().optional(),
          buildIntents: z
            .array(z.enum(BUILD_INTENT_IDS))
            .min(1)
            .max(BUILD_INTENT_MAX_SELECTIONS)
            .optional(),
          buildIntentOther: z
            .string()
            .trim()
            .max(BUILD_INTENT_OTHER_MAX_LENGTH)
            .optional(),
        })
        .refine(
          ({ buildIntents }) =>
            !buildIntents ||
            (new Set(buildIntents).size === buildIntents.length &&
              (!buildIntents.includes(EXCLUSIVE_BUILD_INTENT) ||
                buildIntents.length === 1)),
          { message: "Build intents must be unique; exploring is exclusive" },
        )
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      return completeCloudSignupOnboarding({
        prisma: ctx.prisma,
        userId: ctx.session.user.id,
        userEmail: ctx.session.user.email,
        canCreateOrganizations: ctx.session.user.canCreateOrganizations,
        referralSource: input?.referralSource,
        aiFeaturesEnabled: input?.aiFeaturesEnabled,
        buildIntents: input?.buildIntents,
        buildIntentOther: input?.buildIntentOther,
      });
    }),
});
