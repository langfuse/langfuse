import { z } from "zod";
import {
  completeSignupOnboarding,
  getSignupOnboardingStatus,
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
import { NEWSLETTER_OUTCOMES } from "@/src/features/onboarding/lib/newsletterSignup";

export const onboardingRouter = createTRPCRouter({
  status: authenticatedProcedure.query(async ({ ctx }) => {
    return getSignupOnboardingStatus({
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
          buildIntentPositions: z
            .array(
              z
                .number()
                .int()
                .min(0)
                .max(BUILD_INTENT_IDS.length - 1),
            )
            .max(BUILD_INTENT_MAX_SELECTIONS)
            .optional(),
          buildIntentOther: z
            .string()
            .trim()
            .max(BUILD_INTENT_OTHER_MAX_LENGTH)
            .optional(),
          newsletter: z
            .object({ outcome: z.enum(NEWSLETTER_OUTCOMES) })
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
        .refine(
          ({ buildIntents, buildIntentPositions }) =>
            buildIntentPositions?.length === buildIntents?.length,
          { message: "Each build intent needs its shown position" },
        )
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      return completeSignupOnboarding({
        prisma: ctx.prisma,
        userId: ctx.session.user.id,
        userEmail: ctx.session.user.email,
        canCreateOrganizations: ctx.session.user.canCreateOrganizations,
        referralSource: input?.referralSource,
        aiFeaturesEnabled: input?.aiFeaturesEnabled,
        buildIntents: input?.buildIntents,
        buildIntentPositions: input?.buildIntentPositions,
        buildIntentOther: input?.buildIntentOther,
        newsletter: input?.newsletter,
      });
    }),
});
