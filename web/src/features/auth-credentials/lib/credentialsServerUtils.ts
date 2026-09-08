import { createHash } from "crypto";
import { createProjectMembershipsOnSignup } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import { type AdClickIds } from "@/src/features/auth/lib/signupAttribution";
import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import { compare, hash } from "bcryptjs";

function hashEmailOtpToken(token: string) {
  if (!env.NEXTAUTH_SECRET) {
    throw new Error("NEXTAUTH_SECRET is required for password reset.");
  }
  // NextAuth applies this digest before storing email-provider tokens.
  return createHash("sha256")
    .update(`${token}${env.NEXTAUTH_SECRET}`)
    .digest("hex");
}

/**
 * This function creates a user with an email and password.
 * @param {string} email - A string representing the email address of the user that needs to be
 * created.
 * @param {string} password - The `password` parameter is a string that represents the password that
 * the user wants to use for their account. It will be used to authenticate the user when they log in
 * to their account.
 * @returns {Promise<string>} - A promise that resolves to the id of the user that was created.
 */
export async function createUserEmailPassword(
  email: string,
  password: string,
  name: string,
  options?: {
    /** Ad-platform click ids, see getAdClickIdsFromRequest */
    adClickIds?: AdClickIds;
  },
) {
  if (!isValidPassword(password))
    throw new Error("Password needs to be at least 8 characters long.");

  const hashedPassword = await hashPassword(password);
  // check that no user exists with this email
  const user = await prisma.user.findUnique({
    where: {
      email: email.toLowerCase(),
    },
  });
  if (user !== null) {
    throw new Error(
      user.password !== null
        ? "User with email already exists. Please sign in."
        : "You have already signed up via an identity provider. Please sign in.",
    );
  }

  const newUser = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
    },
  });

  await createProjectMembershipsOnSignup(newUser, {
    userWasJustCreated: true,
    adClickIds: options?.adClickIds,
  });

  return newUser.id;
}

export async function consumeEmailOtpAndUpdatePassword({
  email,
  token,
  password,
}: {
  email: string;
  token: string;
  password: string;
}) {
  if (!isValidPassword(password))
    throw new Error("Password needs to be at least 8 characters long.");

  const identifier = email.toLowerCase();
  const hashedToken = hashEmailOtpToken(token);
  const now = new Date();

  const passwordUpdated = await prisma.$transaction(async (tx) => {
    const consumed = await tx.verificationToken.deleteMany({
      where: {
        identifier,
        token: hashedToken,
        expires: { gt: now },
      },
    });

    if (consumed.count !== 1) {
      // Match the existing NextAuth callback's one-attempt semantics.
      await tx.verificationToken.deleteMany({ where: { identifier } });
      return false;
    }

    // Invalidate any other outstanding code for this account.
    await tx.verificationToken.deleteMany({ where: { identifier } });

    // Keep password hashing behind successful OTP validation so unauthenticated
    // invalid attempts cannot trigger expensive bcrypt work.
    const hashedPassword = await hashPassword(password);
    const updated = await tx.user.updateMany({
      where: { email: identifier },
      data: {
        password: hashedPassword,
        emailVerified: now,
      },
    });

    return updated.count === 1;
  });

  if (!passwordUpdated) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired verification code.",
    });
  }
}

export async function hashPassword(password: string) {
  const hashedPassword = await hash(password, 12);
  return hashedPassword;
}

export async function verifyPassword(password: string, hashedPassword: string) {
  const isValid = await compare(password, hashedPassword);
  return isValid;
}

function isValidPassword(password: string) {
  return password.length >= 8;
}
