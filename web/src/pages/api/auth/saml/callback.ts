import type { NextApiRequest, NextApiResponse } from "next";
import { getJacksonInstance, logger } from "@langfuse/shared/src/server";

/**
 * SAML Assertion Consumer Service (ACS) endpoint.
 *
 * Receives SAML assertions (POST) from the IdP. Delegates to
 * Jackson's oauthController.samlResponse(), which validates the
 * assertion and returns a redirect URL with an authorization code
 * back to next-auth's callback handler.
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

    const { SAMLResponse, RelayState, idp_hint } = req.body as {
      SAMLResponse?: string;
      RelayState?: string;
      idp_hint?: string;
    };

    if (!SAMLResponse) {
      res.status(400).json({ error: "Missing SAMLResponse" });
      return;
    }

    const jackson = await getJacksonInstance();
    const { oauthController } = jackson;

    const result = await oauthController.samlResponse({
      SAMLResponse,
      RelayState: RelayState ?? "",
      idp_hint,
    });

    if (result.redirect_url) {
      res.redirect(302, result.redirect_url);
    } else if (result.app_select_form) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(result.app_select_form);
    } else if (result.response_form) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(result.response_form);
    } else {
      res
        .status(500)
        .json({ error: result.error ?? "SAML response processing failed" });
    }
  } catch (error: unknown) {
    // JacksonError hides the real reason in `internalError`
    const jacksonErr = error as {
      statusCode?: number;
      internalError?: string;
      message?: string;
    };
    logger.error("Error in SAML callback:", {
      message: jacksonErr.message,
      statusCode: jacksonErr.statusCode,
      internalError: jacksonErr.internalError,
    });
    res
      .status(jacksonErr.statusCode ?? 500)
      .json({ error: jacksonErr.internalError ?? "Internal Server Error" });
  }
}
