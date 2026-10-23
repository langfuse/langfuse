import { render } from "@react-email/render";
import {
  createMailTransport,
  getEmailAppBaseUrl,
  type NotificationEventType,
} from "@langfuse/shared/src/server";
import {
  GatewayInvitationEmailTemplate,
  type GatewayInvitationEmailAudience,
} from "@langfuse/shared/src/server/services/email/aiGatewayInvitation/GatewayInvitationEmailTemplate";

import { env } from "../../env";

type GatewayInvitationPayload = Omit<
  Extract<NotificationEventType, { type: "AI_GATEWAY_INVITATION" }>,
  "type"
>;

const getUtmContent = (audience: GatewayInvitationEmailAudience) => {
  if (audience.kind === "member") return "member";
  return audience.hasAccount ? "invitee_existing_user" : "invitee_new_user";
};

/**
 * Tells someone the organization's AI Gateway is ready: either a new invitee
 * (paired with an organization invitation) or an existing member. Missing
 * email configuration and delivery errors are thrown, so the job fails and is
 * kept instead of completing unsent.
 */
export async function handleGatewayInvitationNotification({
  orgId,
  orgName,
  to,
  receiverName,
  audience,
  inviterName,
  inviterEmail,
}: GatewayInvitationPayload) {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    throw new Error(
      "Missing SMTP_CONNECTION_URL or EMAIL_FROM_ADDRESS for sending gateway invitation email.",
    );
  }

  const baseUrl = getEmailAppBaseUrl(env);
  if (!baseUrl) {
    throw new Error(
      "Missing NEXTAUTH_URL or NEXT_PUBLIC_LANGFUSE_CLOUD_REGION for sending gateway invitation email.",
    );
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
}
