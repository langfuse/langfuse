import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";
import { z } from "zod";
import { sanitizeEmailSubject } from "../../../../utils/zod";
import { logger } from "../../../logger";
import { BlobStorageExportFailedEmailTemplate } from "./BlobStorageExportFailedEmailTemplate";

export type SendBlobStorageExportFailedEmailParams = {
  env: Partial<
    Record<
      | "EMAIL_FROM_ADDRESS"
      | "SMTP_CONNECTION_URL"
      | "NEXTAUTH_URL"
      | "CLOUD_CRM_EMAIL",
      string | undefined
    >
  >;
  projectName: string;
  settingsUrl: string;
  receiverEmails: string[];
};

export const sendBlobStorageExportFailedEmail = async ({
  env,
  projectName,
  settingsUrl,
  receiverEmails,
}: SendBlobStorageExportFailedEmailParams) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending blob storage export failed email.",
    );
    return;
  }

  if (receiverEmails.length === 0) {
    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));
    const safeProjectName = sanitizeEmailSubject(projectName);
    const subject = `Blob storage export failed for "${safeProjectName}" – action required`;
    const html = await render(
      BlobStorageExportFailedEmailTemplate({
        projectName: safeProjectName,
        settingsUrl,
      }),
    );

    const mailOptions: Record<string, unknown> = {
      to: receiverEmails,
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
    logger.error("Failed to send blob storage export failed email", error);
  }
};
