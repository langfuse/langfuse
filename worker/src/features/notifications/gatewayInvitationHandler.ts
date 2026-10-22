import {
  type NotificationEventType,
  sendGatewayInvitationEmail,
} from "@langfuse/shared/src/server";

import { env } from "../../env";

type GatewayInvitationPayload = Omit<
  Extract<NotificationEventType, { type: "AI_GATEWAY_INVITATION" }>,
  "type"
>;

export async function handleGatewayInvitationNotification({
  orgId,
  orgName,
  to,
  receiverName,
  audience,
  inviterName,
  inviterEmail,
}: GatewayInvitationPayload) {
  await sendGatewayInvitationEmail({
    env: {
      EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
      SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      NEXTAUTH_URL: env.NEXTAUTH_URL,
    },
    orgId,
    orgName,
    to,
    receiverName,
    audience,
    inviterName,
    inviterEmail,
  });
}
