import { env } from "@/src/env.mjs";
import { isEmailVerificationRequired } from "@/src/features/auth-credentials/lib/credentialsUtils";
import { validateSignupEligibility } from "@/src/features/auth-credentials/server/signupApiHandler";
import { createProjectMembershipsOnSignup } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod/v4";
import { noUrlCheck, StringNoHTMLNonEmpty } from "@langfuse/shared";

const signupVerifySchema = z.object({
  email: z.email(),
  name: StringNoHTMLNonEmpty.refine((value) => noUrlCheck(value), {
    message: "Input should not contain a URL",
  }).refine((value) => /^[a-zA-Z0-9\s]+$/.test(value), {
    message: "Name can only contain letters, numbers, and spaces",
  }),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  if (!isEmailVerificationRequired()) {
    res
      .status(404)
      .json({ message: "Email verification signup is not enabled." });
    return;
  }

  const parsed = signupVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(422)
      .json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { email, name } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  // Run eligibility checks (signup disabled, SSO enforcement, etc.)
  const eligibilityError = await validateSignupEligibility({
    email: normalizedEmail,
  });
  if (eligibilityError) {
    res.status(422).json({ message: eligibilityError });
    return;
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    if (existingUser.password !== null) {
      // User already has a password — they completed signup before
      res.status(422).json({
        message: "User with email already exists. Please sign in.",
      });
      return;
    }
    // Passwordless user exists (abandoned previous attempt) — allow re-sending OTP
    res.status(200).json({ status: "ok" });
    return;
  }

  // Create passwordless user
  try {
    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: null,
        name,
      },
    });

    await createProjectMembershipsOnSignup(newUser);

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
          name,
          email: normalizedEmail,
          cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
          userId: newUser.id,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
  } catch (error) {
    // Handle unique constraint race condition
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      // Another request created the user concurrently — that's fine
      res.status(200).json({ status: "ok" });
      return;
    }
    const message =
      "Signup verify: Error creating user: " +
      (error instanceof Error ? error.message : JSON.stringify(error));
    logger.warn(message, normalizedEmail, name);
    res.status(500).json({ message });
    return;
  }

  res.status(200).json({ status: "ok" });
}
