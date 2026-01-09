/**
 * Override NextAuth's default /api/auth/providers endpoint to prevent
 * exposure of SSO domain information.
 *
 * Background: NextAuth exposes provider IDs like "acme.com.okta" which
 * reveals customer domains. Langfuse doesn't use this endpoint - the
 * sign-in page uses getServerSideProps and /api/auth/check-sso instead.
 */

import { type NextApiRequest, type NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  // Return 404 to prevent enumeration of SSO domains
  return res.status(404).json({
    error: "This endpoint is not available",
  });
}
