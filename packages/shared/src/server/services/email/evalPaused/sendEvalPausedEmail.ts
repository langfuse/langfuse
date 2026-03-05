import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";
import { EvalPausedEmailTemplate } from "./EvalPausedEmailTemplate";
import { logger } from "../../../logger";
import { z } from "zod/v4";

export interface EvalPausedEmailProps {
  env: Partial<
    Record<
      | "EMAIL_FROM_ADDRESS"
      | "SMTP_CONNECTION_URL"
      | "NEXTAUTH_URL"
      | "CLOUD_CRM_EMAIL",
      string | undefined
    >
  >;
  templateName: string;
  pauseReason: string;
  pauseReasonShort: string;
  pauseReasonCode: string;
  resolutionUrl: string;
  receiverEmail: string;
}

export const sendEvalPausedEmail = async ({
  env,
  templateName,
  pauseReason,
  pauseReasonShort,
  pauseReasonCode,
  resolutionUrl,
  receiverEmail,
}: EvalPausedEmailProps) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending eval paused email.",
    );

    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));

    const emailSubject = `⚠️ LLM evaluator "${templateName}" paused - action required`;
    const emailHtml = await render(
      EvalPausedEmailTemplate({
        templateName,
        pauseReason,
        pauseReasonShort,
        pauseReasonCode,
        resolutionUrl,
        receiverEmail,
      }),
    );

    const mailOptions: Record<string, unknown> = {
      to: receiverEmail,
      from: {
        address: env.EMAIL_FROM_ADDRESS,
        name: "Langfuse",
      },
      replyTo: "support@langfuse.com",
      subject: emailSubject,
      html: emailHtml,
    };

    if (env.CLOUD_CRM_EMAIL) {
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
    logger.error(`Failed to send eval paused email`, error);
  }
};
