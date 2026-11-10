import { type NextApiRequest, type NextApiResponse } from "next";

import { getServerAuthSession } from "@/src/server/auth";
import {
  getRequestOrigin,
  serializeOrganizationCookie,
} from "@/src/server/utils/cookies";

/** handler persists the user's current organization so the app root can land there. */
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

  const organizationId = req.query.organizationId;
  if (typeof organizationId !== "string" || organizationId.length === 0) {
    return res.status(400).json({ message: "Invalid organization id" });
  }

  const isMember = session.user.organizations.some(
    (org) => org.id === organizationId,
  );
  const origin = getRequestOrigin(req);

  if (isMember && origin) {
    res.setHeader(
      "Set-Cookie",
      serializeOrganizationCookie({ origin, organizationId }),
    );
  }

  return res.status(204).end();
}
