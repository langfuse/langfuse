import { type NextApiRequest, type NextApiResponse } from "next";

import { getServerAuthSession } from "@/src/server/auth";
import { recordLastVisitedProject } from "@/src/features/projects/server";
import {
  getRequestOrigin,
  serializeProjectCookie,
} from "@/src/server/utils/cookies";

/** handler remembers the user's current project in the region-unscoped project cookie and the per-user server record. */
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
  if (!isMember) return res.status(204).end();

  const origin = getRequestOrigin(req);
  if (origin) {
    res.setHeader(
      "Set-Cookie",
      serializeProjectCookie({ origin, projectId, userId: session.user.id }),
    );
  }
  await recordLastVisitedProject({ userId: session.user.id, projectId });

  return res.status(204).end();
}
