import { env } from "@/src/env.mjs";
import { createUserEmailPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { signupSchema } from "@/src/features/auth/lib/signupSchema";
import { getSsoAuthProviderIdForDomain } from "@/src/ee/features/multi-tenant-sso/utils";
import { ENTERPRISE_SSO_REQUIRED_MESSAGE } from "@/src/features/auth/constants";
import type { NextApiRequest, NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";
import { isEmailVerificationRequired } from "@/src/features/auth-credentials/lib/credentialsUtils";

export function getSSOBlockedDomains() {
  return (
    env.AUTH_DOMAINS_WITH_SSO_ENFORCEMENT?.split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}

/**
 * Validates that a user is eligible to sign up with email/password.
 * Returns an error message string if ineligible, or null if eligible.
 */
export async function validateSignupEligibility({
  email,
}: {
  email: string;
}): Promise<string | null> {
  // Block if disabled by env
  if (
    env.NEXT_PUBLIC_SIGN_UP_DISABLED === "true" ||
    env.AUTH_DISABLE_SIGNUP === "true"
  ) {
    return "Sign up is disabled.";
  }
  if (env.AUTH_DISABLE_USERNAME_PASSWORD === "true") {
    return "Sign up with email and password is disabled for this instance. Please use SSO.";
  }

  // check if email domain is blocked from email/password sign up via env
  const blockedDomains = getSSOBlockedDomains();
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain && blockedDomains.includes(domain)) {
    return "Sign up with email and password is disabled for this domain. Please use SSO.";
  }

  // EE: check if custom SSO configuration is enabled for this domain
  const multiTenantSsoProvider = await getSsoAuthProviderIdForDomain(domain);
  if (multiTenantSsoProvider) {
    return ENTERPRISE_SSO_REQUIRED_MESSAGE;
  }

  return null;
}

/*
 * Sign-up endpoint (email/password users), creates user in database.
 * SSO users are created by the NextAuth adapters.
 */
export async function signupApiHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") return;

  // Block direct signup when email verification is required
  if (isEmailVerificationRequired()) {
    res.status(403).json({
      message:
        "Direct signup is disabled. Please use the email verification flow.",
    });
    return;
  }

  // parse and type check the request body with zod
  const validBody = signupSchema.safeParse(req.body);
  if (!validBody.success) {
    logger.warn("Signup: Invalid body", validBody.error);
    res.status(422).json({ message: validBody.error });
    return;
  }

  const body = validBody.data;

  const eligibilityError = await validateSignupEligibility({
    email: body.email,
  });
  if (eligibilityError) {
    res.status(422).json({ message: eligibilityError });
    return;
  }

  // create the user
  let userId: string;
  try {
    userId = await createUserEmailPassword(
      body.email,
      body.password,
      body.name,
    );
  } catch (error) {
    const message =
      "Signup: Error creating user: " +
      (error instanceof Error ? error.message : JSON.stringify(error));
    logger.warn(message, body.email.toLowerCase(), body.name);
    res.status(422).json({ message: message });

    return;
  }

  // Trigger new user signup event
  if (
    env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK &&
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "STAGING" &&
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "DEV"
  ) {
    await fetch(env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK, {
      method: "POST",
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        referralSource: body.referralSource,
        cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
        userId: userId,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  res.status(200).json({ message: "User created" });
}
