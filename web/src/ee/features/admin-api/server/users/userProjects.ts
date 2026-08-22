import { type NextApiRequest, type NextApiResponse } from "next";
import { findUserOrganizationAccess } from "@/src/ee/features/admin-api/server/users/userAccessService";

// GET - Retrieve the projects a user of an organization has access to, including
// the effective access level per project
export async function handleGetUserProjects(
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string,
  email: string,
) {
  const access = await findUserOrganizationAccess({ orgId, email });

  if (!access) {
    return res.status(404).json({
      error: "User not found in this organization",
    });
  }

  return res.status(200).json(access);
}
