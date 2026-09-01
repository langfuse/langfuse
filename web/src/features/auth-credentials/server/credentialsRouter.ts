import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { consumeEmailOtpAndUpdatePassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { TRPCError } from "@trpc/server";
import { passwordSchema } from "@/src/features/auth/lib/signupSchema";

export const credentialsRouter = createTRPCRouter({
  resetPassword: publicProcedureWithoutTracing
    .input(
      z.object({
        email: z.email(),
        token: z.string().regex(/^\d{6}$/, {
          message: "Verification code must be 6 digits.",
        }),
        password: passwordSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const normalizedEmail = input.email.toLowerCase();
      const sessionEmail = ctx.session?.user?.email?.toLowerCase();
      if (sessionEmail && sessionEmail !== normalizedEmail) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Verification code does not match the signed-in account.",
        });
      }

      await consumeEmailOtpAndUpdatePassword({
        email: normalizedEmail,
        token: input.token,
        password: input.password,
      });
    }),
});
