import type { NextApiRequest, NextApiResponse } from "next";
import type { OAuthReq } from "@boxyhq/saml-jackson";
import { getJacksonInstance, logger } from "@langfuse/shared/src/server";

/**
 * OAuth authorization endpoint for SAML SSO.
 *
 * Receives the authorization request from next-auth and delegates to
 * Jackson's oauthController.authorize(), which returns a redirect URL
 * to the IdP's SAML login page.
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

    const jackson = await getJacksonInstance();
    const { oauthController } = jackson;

    const result = await oauthController.authorize(
      req.query as unknown as OAuthReq,
    );

    if (result.redirect_url) {
      res.redirect(302, result.redirect_url);
    } else if (result.authorize_form) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(result.authorize_form);
    } else {
      res.status(500).json({ error: result.error ?? "Authorization failed" });
    }
  } catch (error) {
    logger.error("Error in SAML authorization:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
