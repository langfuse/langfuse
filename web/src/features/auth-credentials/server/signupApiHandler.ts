import { env } from "@/src/env.mjs";
import { createUserEmailPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { getAdClickIdsFromRequest } from "@/src/features/auth/lib/signupAttribution";
import { signupSchema } from "@/src/features/auth/lib/signupSchema";
import { getSsoAuthProviderIdForDomain } from "@/src/ee/features/multi-tenant-sso/utils";
import type { NextApiRequest, NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";
import { isEmailVerificationRequired } from "@/src/features/auth-credentials/lib/credentialsUtils";
import {
  getSignupError,
  getSignupErrorForMessage,
  type SignupError,
} from "@/src/features/auth-credentials/lib/signupErrors";

export function getSSOBlockedDomains() {
  return (
    env.AUTH_DOMAINS_WITH_SSO_ENFORCEMENT?.split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}

/**
 * Validates that a user is eligible to sign up with email/password.
 * Returns a stable error response if ineligible, or null if eligible.
 */
export async function validateSignupEligibility({
  email,
}: {
  email: string;
}): Promise<SignupError | null> {
  // Block if disabled by env
  if (
    env.NEXT_PUBLIC_SIGN_UP_DISABLED === "true" ||
    env.AUTH_DISABLE_SIGNUP === "true"
  ) {
    return getSignupError("SIGNUP_DISABLED");
  }
  if (env.AUTH_DISABLE_USERNAME_PASSWORD === "true") {
    return getSignupError("PASSWORD_SIGNUP_DISABLED");
  }

  // check if email domain is blocked from email/password sign up via env
  const blockedDomains = getSSOBlockedDomains();
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain && blockedDomains.includes(domain)) {
    return getSignupError("DOMAIN_SSO_REQUIRED");
  }

  // EE: check if custom SSO configuration is enabled for this domain
  const multiTenantSsoProvider = await getSsoAuthProviderIdForDomain(domain);
  if (multiTenantSsoProvider) {
    return getSignupError("ENTERPRISE_SSO_REQUIRED");
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
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Block direct signup when email verification is required
  if (isEmailVerificationRequired()) {
    res.status(403).json(getSignupError("EMAIL_VERIFICATION_REQUIRED"));
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
    res.status(422).json(eligibilityError);
    return;
  }

  // create the user
  let userId: string;
  try {
    userId = await createUserEmailPassword(
      body.email,
      body.password,
      body.name,
      { adClickIds: getAdClickIdsFromRequest(req) },
    );
  } catch (error) {
    const causeMessage =
      error instanceof Error ? error.message : JSON.stringify(error);
    const message = "Signup: Error creating user: " + causeMessage;
    const knownError = getSignupErrorForMessage(causeMessage);
    logger.warn(message, body.email.toLowerCase(), body.name);
    res.status(422).json({
      message,
      ...(knownError ? { code: knownError.code } : {}),
    });

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
