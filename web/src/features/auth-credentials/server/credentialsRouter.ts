import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { passwordSchema } from "@/src/features/auth-credentials/types";
import { updateUserPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { TRPCError } from "@trpc/server";
import { isEmailVerifiedWithinCutoff } from "@/src/features/auth-credentials/lib/credentialsUtils";

export const credentialsRouter = createTRPCRouter({
  resetPassword: protectedProcedure
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
