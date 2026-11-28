import { type NextApiRequest, type NextApiResponse } from "next";
import { handleScimGroupResource } from "@/src/ee/features/scim/server/scimGroups";
import { authorizeScimGroupsRequest } from "@/src/features/scim/server/scimGroups";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Auth and entitlement check; the implementation lives in ee.
  const actor = await authorizeScimGroupsRequest(req, res, {
    route: "/api/public/scim/Groups/[id]",
    methods: ["GET", "PUT", "PATCH", "DELETE"],
  });
  if (!actor) return;

  return handleScimGroupResource(req, res, actor);
}
