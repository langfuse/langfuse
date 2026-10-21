import type { Account, Profile, User } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { hasInternalEmailDomain } from "@/src/features/feature-flags/server";

const verifiedProfileSchema = z.object({
  email: z.string(),
  email_verified: z.literal(true),
});
const githubEmailsSchema = z.array(
  z.object({ email: z.string(), verified: z.boolean() }),
);

/** Persists provider-confirmed email ownership for staff internal views. */
export async function verifyOAuthStaffEmail({
  user,
  account,
  profile,
}: {
  user: User | AdapterUser;
  account: Account | null | undefined;
  profile: Profile | undefined;
}) {
  const email = user.email?.toLowerCase();
  if (
    account?.type !== "oauth" ||
    !email ||
    !hasInternalEmailDomain(email) ||
    ("emailVerified" in user && user.emailVerified)
  ) {
    return;
  }

  try {
    let verified = false;
    if (
      account.provider === "github" ||
      account.provider === `${email.split("@")[1]}.github`
    ) {
      if (!account.access_token) return;
      const response = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          Accept: "application/vnd.github+json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        logger.warn("GitHub staff email verification failed", {
          status: response.status,
        });
        return;
      }
      const emails = githubEmailsSchema.safeParse(await response.json());
      verified =
        emails.success &&
        emails.data.some(
          (entry) => entry.verified && entry.email.toLowerCase() === email,
        );
    } else {
      const proof = verifiedProfileSchema.safeParse(profile);
      verified = proof.success && proof.data.email.toLowerCase() === email;
    }

    if (verified) {
      await prisma.user.updateMany({
        where: { id: user.id, email, emailVerified: null },
        data: { emailVerified: new Date() },
      });
    }
  } catch {
    // Optional ownership verification must not prevent ordinary sign-in.
    logger.warn("Could not verify staff email during OAuth sign-in");
  }
}
