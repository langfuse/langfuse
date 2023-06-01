import { createUserEmailPassword } from "@/src/features/auth/lib/emailPassword";
import { signupSchema } from "@/src/features/auth/lib/signupSchema";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return;

  // parse and type check the request body with zod
  const validBody = signupSchema.safeParse(req.body);
  if (!validBody.success) {
    res.status(422).json({ message: validBody.error });
    return;
  }

  const body = validBody.data;

  // create the user
  try {
    await createUserEmailPassword(body.email, body.password, body.name);
  } catch (error) {
    if (error instanceof Error)
      res.status(422).json({ message: error.message });
    return;
  }

  res.status(200).json({ message: "User created" });
}
