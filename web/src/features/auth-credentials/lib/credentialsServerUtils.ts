import { createHash } from "crypto";
import { createProjectMembershipsOnSignup } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import { advanceSessionsExpiredAtForEmail } from "@/src/features/auth/lib/sessionExpiration";
import type { SignupAttribution } from "@/src/features/auth/lib/signupAttribution";
import { env } from "@/src/env.mjs";
import { hashPassword } from "@/src/features/auth-credentials/lib/passwordHash";
import {
  PASSWORD_RESET_EMAIL_CODE_MAX_AGE_SECONDS,
  SIGNUP_EMAIL_CODE_MAX_AGE_SECONDS,
} from "@/src/features/auth-credentials/lib/credentialsUtils";
import { prisma } from "@langfuse/shared/src/db";
import {
  isSetupPasswordCallbackUrl,
  logger,
} from "@langfuse/shared/src/server";
import {
  captureSignupStep,
  sendSignupWebhook,
} from "@/src/features/auth/lib/signupSteps";

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
  signupAttribution?: SignupAttribution,
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
    ...signupAttribution,
  });

  return newUser.id;
}

/**
 * The email provider's identifier for an address; matches NextAuth 4's
 * default normalization, and throws on a malformed address as it does.
 */
export function normalizeEmailIdentifier(identifier: string): string {
  const trimmedEmail = identifier.normalize("NFKC").trim();
  if (
    (trimmedEmail.match(/@/g) ?? []).length !== 1 ||
    trimmedEmail.includes('"')
  )
    throw new Error("Invalid email address format.");
  const [local, domainWithSuffix] = trimmedEmail.toLowerCase().split("@");
  const domain = domainWithSuffix?.split(",")[0];
  if (!local || !domain || !domain.includes("."))
    throw new Error("Invalid email address format.");
  return `${local}@${domain}`;
}

export type EmailCodeRequest = Awaited<
  ReturnType<typeof describeEmailCodeRequest>
>;

/**
 * An email-code request's code lifetime: the sign-up's for a setup-password
 * request to an account without a password, else the password reset's. A
 * pending sign-up's request also says whether that account had a live code.
 */
export async function describeEmailCodeRequest({
  email,
  callbackUrl,
}: {
  email: unknown;
  callbackUrl: unknown;
}) {
  const account = await findSetupPasswordAccount({ email, callbackUrl });
  const isPendingSignup =
    account?.password === null && account._count.accounts === 0;
  return {
    maxAge:
      account?.password === null
        ? SIGNUP_EMAIL_CODE_MAX_AGE_SECONDS
        : PASSWORD_RESET_EMAIL_CODE_MAX_AGE_SECONDS,
    signupSend: isPendingSignup
      ? {
          userId: account.id,
          isResend: await hasLiveCode(account.identifier),
        }
      : null,
  };
}

// read before the signIn callback clears the account's earlier codes
async function hasLiveCode(identifier: string) {
  const liveCode = await prisma.verificationToken.findFirst({
    where: { identifier, expires: { gt: new Date() } },
    select: { identifier: true },
  });
  return liveCode !== null;
}

async function findSetupPasswordAccount({
  email,
  callbackUrl,
}: {
  email: unknown;
  callbackUrl: unknown;
}) {
  if (
    typeof email !== "string" ||
    typeof callbackUrl !== "string" ||
    !isSetupPasswordCallbackUrl(callbackUrl)
  )
    return null;
  try {
    const identifier = normalizeEmailIdentifier(email);
    const account = await prisma.user.findUnique({
      where: { email: identifier },
      select: {
        id: true,
        password: true,
        _count: { select: { accounts: true } },
      },
    });
    return account ? { identifier, ...account } : null;
  } catch {
    // malformed address: NextAuth refuses to send a code for it
    return null;
  }
}

export type EmailCodeCheck = "ok" | "expired" | "invalid";

/**
 * Sets the password with an email code. A valid code on a pending sign-up
 * also sends the sign-up webhook in the background; its setup-password step
 * records sign_up:code_checked and, for a valid code, sign_up:password_set.
 */
export async function setPasswordWithEmailCode({
  email,
  token,
  password,
  intent,
}: {
  email: string;
  token: string;
  password: string;
  intent: "setup" | "reset" | undefined;
}): Promise<EmailCodeCheck> {
  const signup = await findSignupAwaitingVerification(email);
  const codeCheck = await consumeEmailOtpAndUpdatePassword({
    email,
    token,
    password,
  });
  if (!signup) return codeCheck;

  if (intent === "setup") {
    captureSignupStep(signup.id, "sign_up:code_checked", { result: codeCheck });
    if (codeCheck === "ok") {
      captureSignupStep(signup.id, "sign_up:password_set", {});
    }
  }
  if (codeCheck === "ok") {
    sendSignupWebhook(signup).catch((error) => {
      logger.warn("Sign-up webhook failed", { userId: signup.id, error });
    });
  }
  return codeCheck;
}

/**
 * A valid code also marks the email verified; any check clears the account's
 * outstanding codes, as NextAuth's one-attempt callback does.
 */
async function consumeEmailOtpAndUpdatePassword({
  email,
  token,
  password,
}: {
  email: string;
  token: string;
  password: string;
}): Promise<EmailCodeCheck> {
  if (!isValidPassword(password))
    throw new Error("Password needs to be at least 8 characters long.");

  const identifier = email.toLowerCase();
  const hashedToken = hashEmailOtpToken(token);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const consumed = await tx.verificationToken.deleteMany({
      where: {
        identifier,
        token: hashedToken,
        expires: { gt: now },
      },
    });

    if (consumed.count !== 1) {
      const expiredCode = await tx.verificationToken.findFirst({
        where: { identifier, token: hashedToken },
        select: { identifier: true },
      });
      // Match the existing NextAuth callback's one-attempt semantics.
      await tx.verificationToken.deleteMany({ where: { identifier } });
      return expiredCode ? "expired" : "invalid";
    }

    // Invalidate any other outstanding code for this account.
    await tx.verificationToken.deleteMany({ where: { identifier } });

    // Keep password hashing behind successful OTP validation so unauthenticated
    // invalid attempts cannot trigger expensive hashing work.
    const hashedPassword = await hashPassword(password);
    const updated = await tx.user.updateMany({
      where: { email: identifier },
      data: {
        password: hashedPassword,
        emailVerified: now,
      },
    });

    if (updated.count === 1) {
      await advanceSessionsExpiredAtForEmail(identifier, tx);
    }

    return updated.count === 1 ? "ok" : "invalid";
  });
}

// a pending email sign-up: no password and no linked login yet, as an
// unclaimed SCIM-provisioned account also looks
async function findSignupAwaitingVerification(email: string) {
  return prisma.user.findFirst({
    where: { email, password: null, accounts: { none: {} } },
    select: { id: true, email: true, name: true },
  });
}

function isValidPassword(password: string) {
  return password.length >= 8;
}
