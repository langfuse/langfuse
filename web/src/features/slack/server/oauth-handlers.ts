import { type NextApiRequest, type NextApiResponse } from "next";
import {
  SlackService,
  parseSlackInstallationMetadata,
} from "@langfuse/shared/src/server";
import { logger } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

/**
 * SlackOAuthHandlers
 *
 * Handles Next.js-specific OAuth flow for Slack integration.
 * Uses the configured InstallProvider from SlackService to avoid duplication.
 */
/**
 * Handle OAuth install path using the shared InstallProvider
 */
export async function handleInstallPath(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
) {
  try {
    // Use InstallProvider's handleInstallPath method to render the installation page
    // This method will:
    // 1. Generate the OAuth URL with proper state parameter
    // 2. Set session cookies for state validation
    // 3. Render the installation page with "Add to Slack" button
    const installOptions = {
      scopes: ["channels:read", "chat:write", "chat:write.public"],
      metadata: JSON.stringify({ projectId: projectId }),
      redirectUri: `${env.NEXTAUTH_URL}/api/public/slack/oauth`,
    };

    // hack because nextjs dev server support for https is experimental
    if (env.NODE_ENV === "development") {
      installOptions.redirectUri = installOptions.redirectUri?.replace(
        "http://",
        "https://",
      );
    }
    return await SlackService.getInstance()
      .getInstaller()
      .handleInstallPath(req, res, undefined, installOptions);
  } catch (error) {
    logger.error("Install path handler failed", { error, projectId });
    throw error;
  }
}

/**
 * Handle OAuth callback using the shared InstallProvider
 */
export async function handleCallback(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    return await SlackService.getInstance()
      .getInstaller()
      .handleCallback(req, res, {
        success: async (installation) => {
          const metadata = parseSlackInstallationMetadata(
            installation?.metadata,
          );
          const projectId = metadata.projectId;

          logger.info("OAuth callback successful", {
            projectId,
            teamId: installation.team?.id,
            teamName: installation.team?.name,
          });

          // Redirect to project-specific Slack settings page
          const redirectUrl = `/project/${projectId}/settings/integrations/slack?success=true&team_name=${encodeURIComponent(installation.team?.name || "")}`;
          res.redirect(redirectUrl);
        },

        failure: async (error) => {
          logger.error("OAuth callback failed", { error: error.message });
          res.status(500).json({ message: "Internal server error" });
        },
      });
  } catch (error) {
    logger.error("OAuth callback handler failed", { error });
    throw error;
  }
}
