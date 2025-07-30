import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";
import { BillingAlertEmailTemplate } from "./BillingAlertEmailTemplate";
import { logger } from "../../../logger";

export interface BillingAlertEmailProps {
  env: Partial<
    Record<"EMAIL_FROM_ADDRESS" | "SMTP_CONNECTION_URL", string | undefined>
  >;
  organizationName: string;
  currentUsage: number;
  threshold: number;
  billingUrl: string;
  receiverEmail: string;
}

export const sendBillingAlertEmail = async ({
  env,
  organizationName,
  currentUsage,
  threshold,
  billingUrl,
  receiverEmail,
}: BillingAlertEmailProps) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending billing alert email.",
    );
    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));

    const emailSubject = `Langfuse Cloud Billing Alert: ${organizationName} usage exceeded ${threshold} events`;
    const emailHtml = await render(
      BillingAlertEmailTemplate({
        organizationName,
        currentUsage,
        threshold,
        billingUrl,
        receiverEmail,
      }),
    );

    await mailer.sendMail({
      to: receiverEmail,
      from: {
        address: env.EMAIL_FROM_ADDRESS,
        name: "Langfuse",
      },
      subject: emailSubject,
      html: emailHtml,
    });
  } catch (error) {
    logger.error(`Failed to send billing alert email`, error);
  }
};
