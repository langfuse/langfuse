import { type NextApiRequest, type NextApiResponse } from "next";
import { SlackService } from "@langfuse/shared/src/server";
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

    // Let SlackService handle the entire OAuth callback flow
    // This includes:
    // - Validating the OAuth parameters
    // - Exchanging code for tokens
    // - Storing the installation
    // - Redirecting to the appropriate page
    return await SlackService.getInstance().handleCallback(req, res);
  } catch (error) {
    logger.error("OAuth callback handler failed", { error });

    // Fallback redirect on unexpected errors
    return res.redirect("/settings/slack?error=unexpected_error");
  }
}
