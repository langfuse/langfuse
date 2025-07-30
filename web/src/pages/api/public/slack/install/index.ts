import { type NextApiRequest, type NextApiResponse } from "next";
import { handleInstallPath } from "@/src/features/slack/server/oauth-handlers";
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

    // Extract projectId from query parameters
    const projectId = req.query.projectId as string;

    if (!projectId) {
      return res.status(400).json({ error: "Missing projectId parameter" });
    }

    logger.info("Slack install request received", { projectId });

    // Let SlackOAuthHandlers handle the installation page rendering
    // This includes:
    // - Generating the OAuth URL with proper state
    // - Setting session cookies for state validation
    // - Rendering the installation page
    return await handleInstallPath(req, res, projectId);
  } catch (error) {
    logger.error("Install handler failed", { error });
    return res.status(500).json({ message: "Internal server error" });
  }
}
