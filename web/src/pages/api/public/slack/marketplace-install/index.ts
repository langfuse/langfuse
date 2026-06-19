import { type NextApiRequest, type NextApiResponse } from "next";
import {
  SlackService,
  SLACK_BOT_SCOPES,
  logger,
} from "@langfuse/shared/src/server";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { allowSlackMarketplaceInstall } from "@/src/features/slack/server/marketplaceInstallRateLimit";

/**
 * Slack Marketplace "Direct Install URL" entry point.
 *
 * Slack requires the Marketplace install link to HTTP 302 redirect straight to
 * the OAuth authorize URL, with no project context — the person installing may
 * not even have a Langfuse account yet. We generate a stateless install URL
 * (signed with the state secret, carrying no projectId metadata) and redirect.
 *
 * The shared OAuth callback then stores a pending installation and sends the
 * user to /slack/direct-setup to link it to a project. Unauthenticated by design:
 * anyone viewing the Marketplace listing can start an install. Method dispatch,
 * CORS, and error handling are handled by withMiddlewares.
 */
export default withMiddlewares({
  GET: async (req: NextApiRequest, res: NextApiResponse) => {
    // Guard all three vars the InstallProvider needs (buildInstaller
    // non-null-asserts each). A partial config would otherwise pass this check
    // and surface as a generic 500 from @slack/oauth instead of this 404.
    if (
      !env.SLACK_CLIENT_ID ||
      !env.SLACK_CLIENT_SECRET ||
      !env.SLACK_STATE_SECRET
    ) {
      throw new LangfuseNotFoundError("Slack integration is not configured");
    }

    // Per-IP rate limit (fails open if Redis is down / disabled).
    if (!(await allowSlackMarketplaceInstall(req))) {
      res
        .status(429)
        .json({ error: "Too many requests. Please try again later." });
      return;
    }

    const redirectUri = `${env.NEXTAUTH_URL}/api/public/slack/oauth`;

    logger.info("Slack marketplace install initiated");
    // handleInstallPath sets the OAuth state cookie that handleCallback
    // verifies, then (directInstall) 302s to Slack's authorize URL. Calling
    // generateInstallUrl directly would skip that cookie -> invalid_state.
    await SlackService.getInstance()
      .getInstaller()
      .handleInstallPath(req, res, undefined, {
        scopes: [...SLACK_BOT_SCOPES],
        redirectUri,
        // No metadata: the project is chosen after OAuth in /slack/direct-setup.
      });
  },
});
