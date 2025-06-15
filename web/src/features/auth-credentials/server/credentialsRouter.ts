import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { updateUserPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { TRPCError } from "@trpc/server";
import { isEmailVerifiedWithinCutoff } from "@/src/features/auth-credentials/lib/credentialsUtils";
import { passwordSchema } from "@/src/features/auth/lib/signupSchema";

export const credentialsRouter = createTRPCRouter({
  resetPassword: protectedProcedureWithoutTracing
    .input(
      z.object({
        password: passwordSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.prisma.user.findUnique({
        where: {
          id: ctx.session.user.id,
        },
        select: {
          emailVerified: true,
        },
      });

      const emailVerificationStatus = isEmailVerifiedWithinCutoff(
        user?.emailVerified?.toISOString(),
      );

      if (!emailVerificationStatus.verified) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            emailVerificationStatus.reason === "not_verified"
              ? "Email not verified."
              : "Email verification expired.",
        });
      }

      await updateUserPassword(ctx.session.user.id, input.password);
    }),
});
