import type { NextApiRequest, NextApiResponse } from "next";
import { getJacksonInstance, logger } from "@langfuse/shared/src/server";

/**
 * OAuth userinfo endpoint for SAML SSO.
 *
 * Receives the access token and returns user profile attributes
 * extracted from the SAML assertion via Jackson's oauthController.userInfo().
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res
        .status(401)
        .json({ error: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.substring(7);
    const jackson = await getJacksonInstance();
    const { oauthController } = jackson;

    const profile = await oauthController.userInfo(token);
    res.status(200).json(profile);
  } catch (error) {
    logger.error("Error in SAML user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
