import { env } from "@/src/env.mjs";
import { createUserEmailPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { signupSchema } from "@/src/features/auth/lib/signupSchema";
import { getSsoAuthProviderIdForDomain } from "@langfuse/ee/sso";
import type { NextApiRequest, NextApiResponse } from "next";

/*
 * Sign-up endpoint (email/password users), creates user in database.
 * SSO users are created by the NextAuth adapters.
 */
export async function signupApiHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") return;
  // Block if disabled by env
  if (
    env.NEXT_PUBLIC_SIGN_UP_DISABLED === "true" ||
    env.AUTH_DISABLE_SIGNUP === "true"
  ) {
    res.status(422).json({ message: "Sign up is disabled." });
    return;
  }
  if (env.AUTH_DISABLE_USERNAME_PASSWORD === "true") {
    res.status(422).json({
      message:
        "Sign up with email and password is disabled for this instance. Please use SSO.",
    });
    return;
  }

  // parse and type check the request body with zod
  const validBody = signupSchema.safeParse(req.body);
  if (!validBody.success) {
    console.log("Signup: Invalid body", validBody.error);
    res.status(422).json({ message: validBody.error });
    return;
  }

  const body = validBody.data;

  // check if email domain is blocked from email/password sign up via env
  const blockedDomains =
    env.AUTH_DOMAINS_WITH_SSO_ENFORCEMENT?.split(",") ?? [];
  const domain = body.email.split("@")[1]?.toLowerCase();
  if (domain && blockedDomains.includes(domain)) {
    res.status(422).json({
      message:
        "Sign up with email and password is disabled for this domain. Please use SSO.",
    });
    return;
  }

  // EE: check if custom SSO configuration is enabled for this domain
  const customSsoProvider = await getSsoAuthProviderIdForDomain(domain);
  if (customSsoProvider) {
    res.status(422).json({
      message: "You must sign in via SSO for this domain.",
    });
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
    if (error instanceof Error) {
      console.log(
        "Signup: Error creating user",
        error.message,
        body.email.toLowerCase(),
        body.name,
      );
      res.status(422).json({ message: error.message });
    }
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
