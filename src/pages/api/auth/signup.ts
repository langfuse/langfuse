import { createUserEmailPassword } from "@/src/features/auth/lib/emailPassword";
import { signupSchema } from "@/src/features/auth/lib/signupSchema";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") return;

  // parse and type check the request body with zod
  const validBody = signupSchema.safeParse(req.body);
  if (!validBody.success) {
    console.log("Signup: Invalid body", validBody.error);
    res.status(422).json({ message: validBody.error });
    return;
  }

  const body = validBody.data;

  // create the user
  try {
    await createUserEmailPassword(body.email, body.password, body.name);
  } catch (error) {
    if (error instanceof Error) {
      console.log(
        "Signup: Error creating user",
        error.message,
        body.email,
        body.name,
      );
      res.status(422).json({ message: error.message });
    }
    return;
  }

  res.status(200).json({ message: "User created" });
}
