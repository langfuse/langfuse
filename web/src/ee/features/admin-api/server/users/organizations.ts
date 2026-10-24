import { type NextApiRequest, type NextApiResponse } from "next";
import { findUserOrganizations } from "@/src/ee/features/admin-api/server/users/userAccessService";

// GET - Retrieve all organizations a user belongs to, looked up by email
export async function handleGetUserOrganizations(
  req: NextApiRequest,
  res: NextApiResponse,
  email: string,
) {
  const user = await findUserOrganizations({ email });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.status(200).json(user);
}
