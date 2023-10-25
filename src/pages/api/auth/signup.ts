import { env } from "@/src/env.mjs";
import { createUserEmailPassword } from "@/src/features/auth/lib/emailPassword";
import { signupSchema } from "@/src/features/auth/lib/signupSchema";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") return;
  if (env.NEXT_PUBLIC_SIGN_UP_DISABLED === "true") {
    res.status(422).json({ message: "Sign up is disabled." });
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
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
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
