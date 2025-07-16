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

  const emailText = `
Billing Alert: Usage Threshold Exceeded

Organization: ${organizationName}
Current Usage: $${currentUsage.toFixed(2)}
Alert Threshold: $${threshold.toFixed(2)}
Billing Period: ${billingPeriod}

Usage Breakdown:
- Traces: ${usageBreakdown.traces.toLocaleString()} events
- Observations: ${usageBreakdown.observations.toLocaleString()} events
- Scores: ${usageBreakdown.scores.toLocaleString()} events
- Total: ${(usageBreakdown.traces + usageBreakdown.observations + usageBreakdown.scores).toLocaleString()} events

What happens next?
• Your current billing cycle continues normally
• Charges will appear on your next invoice
• You can adjust usage or modify alert thresholds
• Contact support if you have questions about your bill

View Usage Dashboard: ${dashboardUrl}
Manage Alert Settings: ${manageAlertsUrl}

Questions? Contact us at support@langfuse.com
`;

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));

    await mailer.sendMail({
      to: receiverEmail,
      from: `Langfuse <${env.EMAIL_FROM_ADDRESS}>`,
      subject: emailSubject,
      html: emailHtml,
      text: emailText,
    });
  } catch (error) {
    logger.error(error);
  }
};
