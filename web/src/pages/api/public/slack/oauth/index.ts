import { type NextApiRequest, type NextApiResponse } from "next";
import { handleCallback } from "@/src/features/slack/server/oauth-handlers";
import { logger } from "@langfuse/shared/src/server";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);

    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Let SlackOAuthHandlers handle the entire OAuth callback flow
    // This includes:
    // - Validating the OAuth parameters
    // - Exchanging code for tokens
    // - Storing the installation
    // - Redirecting to the appropriate page
    return await handleCallback(req, res);
  } catch (error) {
    logger.error("OAuth callback handler failed", { error });
    return res.status(500).json({ message: "Internal server error" });
  }
}
