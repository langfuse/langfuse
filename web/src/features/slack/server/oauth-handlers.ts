import { type NextApiRequest, type NextApiResponse } from "next";
import {
  SlackService,
  SLACK_BOT_SCOPES,
  tryGetProjectIdFromMetadata,
} from "@langfuse/shared/src/server";
import { logger } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { getServerAuthSession } from "@/src/server/auth";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { prisma } from "@langfuse/shared/src/db";
import { setPendingInstallClaimCookie } from "@/src/features/slack/server/pendingInstallClaimCookie";

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
    // handleInstallPath generates the OAuth URL with a signed state parameter,
    // sets the state cookie, and (directInstall) 302-redirects straight to
    // Slack's authorize URL.
    const installOptions = {
      scopes: [...SLACK_BOT_SCOPES],
      metadata: JSON.stringify({ projectId: projectId }),
      redirectUri: `${env.NEXTAUTH_URL}/api/public/slack/oauth`,
    };

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
          const projectId = tryGetProjectIdFromMetadata(installation?.metadata);
          const teamId = installation.team?.id;
          const teamName = installation.team?.name;

          logger.info("OAuth callback successful", {
            projectId,
            teamId,
            teamName,
          });

          if (!teamId) {
            // storeInstallation already rejects installs missing team/bot
            // details, so this is defensive; treat it as a failed install.
            logger.error("Slack OAuth callback completed without a team id", {
              projectId,
            });
            res.redirect("/slack/direct-setup");
            return;
          }

          // Marketplace flow: no project chosen yet (the Direct Install URL
          // redirects straight to OAuth). storeInstallation already saved a
          // pending row; send the user to onboarding to link it to a project.
          if (!projectId) {
            const claimToken =
              await SlackService.getInstance().issuePendingInstallationClaim(
                teamId,
              );
            if (!claimToken) {
              logger.error("Slack OAuth callback could not issue claim token", {
                teamId,
              });
              res.redirect("/slack/direct-setup");
              return;
            }
            // Deliver the claim as an httpOnly cookie bound to this browser
            // rather than a URL parameter — it is a bearer credential for a
            // live bot token and must not land in history/Referer. The link
            // procedures read it server-side. team_id/team_name stay in the URL
            // (not secret) for display.
            setPendingInstallClaimCookie(res, teamId, claimToken);
            const onboardingUrl = `/slack/direct-setup?team_id=${encodeURIComponent(
              teamId,
            )}&team_name=${encodeURIComponent(teamName ?? "")}`;
            res.redirect(onboardingUrl);
            return;
          }

          // In-app "Connect" flow: the install is already linked to the project.
          // Create an audit log; the session is still valid from when the user
          // initiated the install.
          try {
            const session = await getServerAuthSession({ req, res });
            if (session?.user?.id) {
              const integration = await prisma.slackIntegration.findUnique({
                where: { projectId },
                select: {
                  id: true,
                  projectId: true,
                  project: { select: { orgId: true } },
                },
              });

              // project is non-null here (the row was just linked by projectId),
              // but the relation is optional in the schema, so guard it.
              if (integration?.project) {
                await auditLog({
                  userId: session.user.id,
                  orgId: integration.project.orgId,
                  projectId,
                  resourceType: "slackIntegration",
                  resourceId: integration.id,
                  action: "create",
                  after: { teamId, teamName },
                });
              }
            }
          } catch (auditError) {
            // Don't fail the callback if audit logging fails
            logger.warn("Failed to create audit log for Slack installation", {
              error: auditError,
              projectId,
            });
          }

          // Redirect to project-specific Slack settings page
          const redirectUrl = `/project/${projectId}/settings/integrations/slack?success=true&team_name=${encodeURIComponent(teamName || "")}`;
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
