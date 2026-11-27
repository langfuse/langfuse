import { type NextApiRequest, type NextApiResponse } from "next";
import { handleScimGroupsCollection } from "@/src/ee/features/scim/server/scimGroups";
import { authorizeScimGroupsRequest } from "@/src/features/scim/server/scimGroups";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Auth and entitlement check; the implementation lives in ee.
  const actor = await authorizeScimGroupsRequest(req, res, {
    route: "/api/public/scim/Groups",
    methods: ["GET", "POST"],
  });
  if (!actor) return;

  return handleScimGroupsCollection(req, res, actor);
}
