import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";
import { UsageThresholdWarningEmailTemplate } from "./UsageThresholdWarningEmailTemplate";
import { logger } from "../../../logger";

export interface UsageThresholdWarningEmailProps {
  env: Partial<
    Record<
      "EMAIL_FROM_ADDRESS" | "SMTP_CONNECTION_URL" | "NEXTAUTH_URL",
      string | undefined
    >
  >;
  organizationName: string;
  currentUsage: number;
  limit: number;
  billingUrl: string;
  receiverEmail: string;
}

export const sendUsageThresholdWarningEmail = async ({
  env,
  organizationName,
  currentUsage,
  limit,
  billingUrl,
  receiverEmail,
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
      }),
    );

    await mailer.sendMail({
      to: receiverEmail,
      from: {
        address: env.EMAIL_FROM_ADDRESS,
        name: "Langfuse",
      },
      replyTo: "support@langfuse.com",
      subject: emailSubject,
      html: emailHtml,
    });
  } catch (error) {
    logger.error(`Failed to send usage notification email`, error);
  }
};
