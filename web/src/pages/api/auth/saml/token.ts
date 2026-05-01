import type { NextApiRequest, NextApiResponse } from "next";
import { getJacksonInstance, logger } from "@langfuse/shared/src/server";

/**
 * OAuth token exchange endpoint for SAML SSO.
 *
 * Receives the authorization code from next-auth and exchanges it
 * for an access token via Jackson's oauthController.token().
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    const jackson = await getJacksonInstance();
    const { oauthController } = jackson;

    const tokenRes = await oauthController.token(
      req.body,
      req.headers.authorization,
    );

    res.status(200).json(tokenRes);
  } catch (error) {
    logger.error("Error in SAML token:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
