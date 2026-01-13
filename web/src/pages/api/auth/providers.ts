import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Disable the /api/auth/providers endpoint.
 *
 * NextAuth automatically exposes this endpoint which lists all configured
 * authentication providers. This can be a security concern as it reveals
 * available authentication methods to potential attackers.
 *
 * Since NextAuth doesn't provide a native way to disable specific endpoints,
 * we override the route with a custom handler that returns 404.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  return res.status(404).json({ error: "Not found" });
}
