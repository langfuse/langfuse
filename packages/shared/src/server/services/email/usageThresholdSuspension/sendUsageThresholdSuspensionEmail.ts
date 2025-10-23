import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";
// import { UsageThresholdUpcomingEnforcementEmailTemplate } from "./UsageThresholdUpcomingEnforcementEmailTemplate";
import { UsageThresholdSuspensionEmailTemplate } from "./UsageThresholdSuspensionEmailTemplate";
import { logger } from "../../../logger";
import { z } from "zod/v4";

export interface UsageThresholdSuspensionEmailProps {
  env: Partial<
    Record<
      | "EMAIL_FROM_ADDRESS"
      | "SMTP_CONNECTION_URL"
      | "NEXTAUTH_URL"
      | "CLOUD_CRM_EMAIL",
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

export const sendUsageThresholdSuspensionEmail = async ({
  env,
  organizationName,
  currentUsage,
  limit,
  billingUrl,
  receiverEmail,
  resetDate,
}: UsageThresholdSuspensionEmailProps) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending usage threshold suspension email.",
    );
    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));

    // const emailSubject = `🚨 URGENT: Action required for ${organizationName} - enforcement begins next week`;
    const emailSubject = `🚨 URGENT: Langfuse ingestion suspended for ${organizationName}`;
    const emailHtml = await render(
      UsageThresholdSuspensionEmailTemplate({
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
    if (env.CLOUD_CRM_EMAIL) {
      // Validate email format to prevent email header injection
      const emailSchema = z.string().email();
      const validationResult = emailSchema.safeParse(env.CLOUD_CRM_EMAIL);

      if (validationResult.success) {
        mailOptions.bcc = validationResult.data;
      } else {
        logger.warn(
          `Invalid CLOUD_CRM_EMAIL format: ${env.CLOUD_CRM_EMAIL}. Skipping BCC.`,
        );
      }
    }

    await mailer.sendMail(mailOptions);
  } catch (error) {
    logger.error(`Failed to send ingestion suspended email`, error);
  }
};
