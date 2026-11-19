import { render } from "@react-email/render";
import {
  createMailTransport,
  getEmailAppBaseUrl,
  type NotificationEventType,
} from "@langfuse/shared/src/server";
import {
  GatewaySpendLimitEmailTemplate,
  getGatewaySpendLimitEmailSubject,
} from "@langfuse/shared/src/server/services/email/aiGatewaySpendLimit/GatewaySpendLimitEmailTemplate";

import { env } from "../../env";

type GatewaySpendLimitPayload = Omit<
  Extract<NotificationEventType, { type: "AI_GATEWAY_SPEND_LIMIT_REACHED" }>,
  "type"
>;

/**
 * Tells a gateway key's owner or an organization owner which spend limits the
 * key reached. Missing email configuration and delivery errors are thrown, so
 * the job fails and is kept instead of completing unsent.
 */
export async function handleGatewaySpendLimitNotification({
  orgId,
  orgName,
  to,
  receiverName,
  audience,
  scope,
  limits,
}: GatewaySpendLimitPayload) {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    throw new Error(
      "Missing SMTP_CONNECTION_URL or EMAIL_FROM_ADDRESS for sending gateway spend limit email.",
    );
  }

  const baseUrl = getEmailAppBaseUrl(env);
  if (!baseUrl) {
    throw new Error(
      "Missing NEXTAUTH_URL or NEXT_PUBLIC_LANGFUSE_CLOUD_REGION for sending gateway spend limit email.",
    );
  }

  const html = await render(
    GatewaySpendLimitEmailTemplate({
      audience,
      orgName,
      scope,
      limits: limits.map(({ interval, limitUsd, resetsAt }) => ({
        interval: interval.toLowerCase(),
        limitUsd,
        resetsAt: resetsAt
          ? `${new Date(resetsAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "UTC",
            })} UTC`
          : undefined,
      })),
      receiverEmail: to,
      receiverName,
      link: `${baseUrl}/organization/${orgId}/ai-gateway/${scope.type === "USER" ? "budgets" : "api-keys"}`,
      emailFromAddress: env.EMAIL_FROM_ADDRESS,
    }),
  );

  await createMailTransport(env.SMTP_CONNECTION_URL).sendMail({
    to,
    from: `Langfuse <${env.EMAIL_FROM_ADDRESS}>`,
    subject: getGatewaySpendLimitEmailSubject(scope, orgName, limits.length),
    html,
  });
}
