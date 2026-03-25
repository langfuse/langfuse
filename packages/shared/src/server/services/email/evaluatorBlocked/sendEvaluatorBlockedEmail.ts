import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";
import { EvaluatorBlockReason } from "@prisma/client";
import { z } from "zod";
import { sanitizeEmailSubject } from "../../../../utils/zod";
import { logger } from "../../../logger";
import { EvaluatorBlockedEmailTemplate } from "./EvaluatorBlockedEmailTemplate";

export type SendEvaluatorBlockedEmailParams = {
  env: Partial<
    Record<
      | "EMAIL_FROM_ADDRESS"
      | "SMTP_CONNECTION_URL"
      | "NEXTAUTH_URL"
      | "CLOUD_CRM_EMAIL",
      string | undefined
    >
  >;
  evaluatorName: string;
  blockReason: EvaluatorBlockReason;
  blockMessage: string;
  resolutionUrl: string;
  receiverEmail: string;
};

export const sendEvaluatorBlockedEmail = async ({
  env,
  evaluatorName,
  blockReason,
  blockMessage,
  resolutionUrl,
  receiverEmail,
}: SendEvaluatorBlockedEmailParams) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending evaluator blocked email.",
    );
    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));
    const safeEvaluatorName = sanitizeEmailSubject(evaluatorName);
    const subject = `⚠️ LLM evaluator "${safeEvaluatorName}" paused - action required`;
    const html = await render(
      EvaluatorBlockedEmailTemplate({
        evaluatorName: safeEvaluatorName,
        blockReason,
        blockMessage,
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
      subject,
      html,
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
    logger.error("Failed to send evaluator blocked email", error);
  }
};
