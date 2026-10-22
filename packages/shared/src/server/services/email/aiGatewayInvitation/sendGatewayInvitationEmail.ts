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
  inviterName: string;
  inviterEmail: string;
  orgName: string;
  orgId: string;
};

/**
 * Tells someone the organization's AI Gateway is ready: either a new invitee
 * (paired with an organization invitation) or an existing member. Failures are
 * logged, not thrown, so one bad address does not abort a batch.
 */
export const sendGatewayInvitationEmail = async ({
  env,
  audience,
  to,
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
  const link =
    audience.kind === "invitee" && !audience.hasAccount
      ? `${baseUrl}/auth/sign-up?targetPath=${encodeURIComponent(gatewayKeysPath)}&email=${encodeURIComponent(to)}`
      : `${baseUrl}${gatewayKeysPath}`;

  try {
    const html = await render(
      GatewayInvitationEmailTemplate({
        audience,
        inviterName,
        inviterEmail,
        orgName,
        receiverEmail: to,
        link,
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
  } catch (error) {
    logger.error(error);
  }
};
