import { render } from "@react-email/render";

import { logger } from "../../../logger";
import { getEmailAppBaseUrl } from "../getEmailAppBaseUrl";
import { createMailTransport } from "../transport";
import {
  GatewayInvitationEmailTemplate,
  type GatewayInvitationEmailAudience,
} from "./GatewayInvitationEmailTemplate";

type SendGatewayInvitationEmailParams = {
  env: Partial<
    Record<
      | "EMAIL_FROM_ADDRESS"
      | "SMTP_CONNECTION_URL"
      | "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION"
      | "NEXTAUTH_URL",
      string | undefined
    >
  >;
  audience: GatewayInvitationEmailAudience;
  to: string;
  receiverName?: string;
  inviterName: string;
  inviterEmail: string;
  orgName: string;
  orgId: string;
};

const getUtmContent = (audience: GatewayInvitationEmailAudience) => {
  if (audience.kind === "member") return "member";
  return audience.hasAccount ? "invitee_existing_user" : "invitee_new_user";
};

/**
 * Tells someone the organization's AI Gateway is ready: either a new invitee
 * (paired with an organization invitation) or an existing member. Missing
 * email configuration is logged and skipped; delivery errors are thrown so the
 * notification queue retries them.
 */
export const sendGatewayInvitationEmail = async ({
  env,
  audience,
  to,
  receiverName,
  inviterName,
  inviterEmail,
  orgName,
  orgId,
}: SendGatewayInvitationEmailParams) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending gateway invitation email.",
    );
    return;
  }

  const baseUrl = getEmailAppBaseUrl(env);
  if (!baseUrl) {
    logger.error(
      "Missing NEXTAUTH_URL or NEXT_PUBLIC_LANGFUSE_CLOUD_REGION environment variable.",
    );
    return;
  }

  const gatewayKeysPath = `/organization/${orgId}/settings/ai-gateway-api-keys`;
  const isNewUser = audience.kind === "invitee" && !audience.hasAccount;
  const link = new URL(
    isNewUser ? `${baseUrl}/auth/sign-up` : `${baseUrl}${gatewayKeysPath}`,
  );
  if (isNewUser) {
    link.searchParams.set("targetPath", gatewayKeysPath);
    link.searchParams.set("email", to);
  }
  // Read by PostHog on the landing pageview to attribute clicks and sign-ups
  // to this email; self-hosted instances run no analytics.
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    link.searchParams.set("utm_source", "langfuse");
    link.searchParams.set("utm_medium", "email");
    link.searchParams.set("utm_campaign", "ai_gateway_invite");
    link.searchParams.set("utm_content", getUtmContent(audience));
  }

  const html = await render(
    GatewayInvitationEmailTemplate({
      audience,
      inviterName,
      inviterEmail,
      orgName,
      receiverEmail: to,
      receiverName,
      link: link.toString(),
      emailFromAddress: env.EMAIL_FROM_ADDRESS,
      langfuseCloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    }),
  );

  await createMailTransport(env.SMTP_CONNECTION_URL).sendMail({
    to,
    from: `Langfuse <${env.EMAIL_FROM_ADDRESS}>`,
    subject:
      audience.kind === "invitee"
        ? `${inviterName} invited you to the AI Gateway in "${orgName}" on Langfuse`
        : `${inviterName} set up the AI Gateway for "${orgName}" on Langfuse`,
    html,
  });
};
