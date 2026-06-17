import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";

import { getServerAuthSession } from "@/src/server/auth";
import {
  getRequestOrigin,
  serializeLastProjectCookie,
} from "@/src/server/utils/cookies";

const requestSchema = z.object({
  projectId: z.string().min(1),
});

/** handler persists the user's current project in the region-unscoped last-project cookie. */
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

  const validBody = requestSchema.safeParse(req.body);
  if (!validBody.success) {
    return res.status(400).json({ message: "Invalid request body" });
  }

  const isMember = session.user.organizations
    .flatMap((org) => org.projects)
    .some((project) => project.id === validBody.data.projectId);
  const origin = getRequestOrigin(req);

  if (isMember && origin) {
    res.setHeader(
      "Set-Cookie",
      serializeLastProjectCookie({
        origin,
        projectId: validBody.data.projectId,
      }),
    );
  }

  return res.status(204).end();
}
