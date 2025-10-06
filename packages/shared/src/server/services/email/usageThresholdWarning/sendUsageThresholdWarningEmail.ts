import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";
import { UsageThresholdWarningEmailTemplate } from "./UsageThresholdWarningEmailTemplate";
import { logger } from "../../../logger";

export interface UsageThresholdWarningEmailProps {
  env: Partial<
    Record<
      | "EMAIL_FROM_ADDRESS"
      | "SMTP_CONNECTION_URL"
      | "NEXTAUTH_URL"
      | "USAGE_THRESHOLD_EMAIL_BCC",
      string | undefined
    >
  >;
  organizationName: string;
  currentUsage: number;
  limit: number;
  billingUrl: string;
  receiverEmail: string;
  resetDate: string; // ISO date string for when usage resets
}

export const sendUsageThresholdWarningEmail = async ({
  env,
  organizationName,
  currentUsage,
  limit,
  billingUrl,
  receiverEmail,
  resetDate,
}: UsageThresholdWarningEmailProps) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending usage notification email.",
    );
    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));

    const emailSubject = `Langfuse Free Tier: ${organizationName} usage reached ${limit.toLocaleString()} events`;
    const emailHtml = await render(
      UsageThresholdWarningEmailTemplate({
        organizationName,
        currentUsage,
        limit,
        billingUrl,
        receiverEmail,
        resetDate,
      }),
    );

    const mailOptions: any = {
      to: receiverEmail,
      from: {
        address: env.EMAIL_FROM_ADDRESS,
        name: "Langfuse",
      },
      replyTo: "support@langfuse.com",
      subject: emailSubject,
      html: emailHtml,
    };

    // Add BCC if configured (optional, for CRM integration)
    if (env.USAGE_THRESHOLD_EMAIL_BCC) {
      mailOptions.bcc = env.USAGE_THRESHOLD_EMAIL_BCC;
    }

    await mailer.sendMail(mailOptions);
  } catch (error) {
    logger.error(`Failed to send usage notification email`, error);
  }
};
