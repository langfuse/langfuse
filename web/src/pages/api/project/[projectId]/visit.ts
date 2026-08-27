import { type NextApiRequest, type NextApiResponse } from "next";

import { getServerAuthSession } from "@/src/server/auth";
import {
  getRequestOrigin,
  serializeProjectCookie,
} from "@/src/server/utils/cookies";

/** handler persists the user's current project in the region-unscoped project cookie. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  const session = await getServerAuthSession({ req, res });
  if (!session?.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const projectId = req.query.projectId;
  if (typeof projectId !== "string" || projectId.length === 0) {
    return res.status(400).json({ message: "Invalid project id" });
  }

  const isMember = session.user.organizations
    .flatMap((org) => org.projects)
    .some((project) => project.id === projectId);

  const origin = getRequestOrigin(req);

  if (isMember && origin) {
    res.setHeader("Set-Cookie", serializeProjectCookie({ origin, projectId }));
  }

  return res.status(204).end();
}
