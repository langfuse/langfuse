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
  currency: string;
  billingPeriod: string;
  usageBreakdown: {
    traces: number;
    observations: number;
    scores: number;
  };
  dashboardUrl: string;
  manageAlertsUrl: string;
  receiverEmail: string;
}

export const sendBillingAlertEmail = async ({
  env,
  organizationName,
  currentUsage,
  threshold,
  currency,
  billingPeriod,
  usageBreakdown,
  dashboardUrl,
  manageAlertsUrl,
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

    const emailSubject = `Billing Alert: ${organizationName} exceeded $${threshold.toFixed(2)} usage threshold`;
    const emailHtml = await render(
      BillingAlertEmailTemplate({
        organizationName,
        currentUsage,
        threshold,
        currency,
        billingPeriod,
        usageBreakdown,
        dashboardUrl,
        manageAlertsUrl,
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
