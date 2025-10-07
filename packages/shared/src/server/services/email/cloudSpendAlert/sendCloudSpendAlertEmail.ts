import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";
import { CloudSpendAlertEmailTemplate } from "./CloudSpendAlertEmailTemplate";
import { logger } from "../../../logger";

export interface CloudSpendAlertEmailProps {
  env: Partial<
    Record<
      "EMAIL_FROM_ADDRESS" | "SMTP_CONNECTION_URL" | "NEXTAUTH_URL",
      string | undefined
    >
  >;
  orgId: string;
  orgName: string;
  alertTitle: string;
  currentSpend: number;
  threshold: number;
  detectedAtUtc?: string;
  recipients: string[];
}

export const sendCloudSpendAlertEmail = async ({
  env,
  orgId,
  orgName,
  alertTitle,
  currentSpend,
  threshold,
  detectedAtUtc,
  recipients,
}: CloudSpendAlertEmailProps) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending cloud spend alert email.",
    );
    return;
  }

  if (recipients.length === 0) {
    logger.warn(`No recipients found for cloud spend alert for org ${orgId}`);
    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));

    const billingUrl = `${env.NEXTAUTH_URL}/organization/${orgId}/settings/billing`;
    const emailSubject = `Langfuse Spend Alert · ${orgName} reached $${threshold.toFixed(2)}`;

    // Send email to each recipient
    for (const recipient of recipients) {
      const emailHtml = await render(
        CloudSpendAlertEmailTemplate({
          organizationName: orgName,
          alertTitle,
          currentSpend,
          threshold,
          billingUrl,
          detectedAtUtc,
          receiverEmail: recipient,
        }),
      );

      await mailer.sendMail({
        to: recipient,
        from: {
          address: env.EMAIL_FROM_ADDRESS,
          name: "Langfuse",
        },
        subject: emailSubject,
        html: emailHtml,
      });

      logger.info(
        `Sent cloud spend alert email to ${recipient} for org ${orgId}`,
      );
    }

    logger.info(
      `Successfully sent cloud spend alert emails to ${recipients.length} recipients for org ${orgId}`,
    );
  } catch (error) {
    logger.error(
      `Failed to send cloud spend alert email for org ${orgId}`,
      error,
    );
    throw error;
  }
};
