import { render } from "@react-email/render";
import { createMailTransport } from "../transport";
import { z } from "zod";
import { sanitizeEmailSubject } from "../../../../utils/zod";
import { logger } from "../../../logger";
import {
  IntegrationExportFailedEmailTemplate,
  type IntegrationExportFailedEmailCopy,
} from "./IntegrationExportFailedEmailTemplate";

export type SendIntegrationExportFailedEmailParams = {
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
  // When true, the export was disabled and needs the customer to fix their
  // config and re-enable it, rather than a transient failure.
  disabled?: boolean;
};

export const sendIntegrationExportFailedEmail = async (
  copy: IntegrationExportFailedEmailCopy,
  {
    env,
    projectName,
    settingsUrl,
    receiverEmails,
    disabled = false,
  }: SendIntegrationExportFailedEmailParams,
) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      `Missing environment variables for sending ${copy.inlineLabel} export failed email.`,
    );
    return;
  }

  if (receiverEmails.length === 0) {
    return;
  }

  try {
    const mailer = createMailTransport(env.SMTP_CONNECTION_URL);
    const safeProjectName = sanitizeEmailSubject(projectName);
    const subject = disabled
      ? `${copy.subjectLabel} export disabled for "${safeProjectName}" – action required`
      : `${copy.subjectLabel} export failed for "${safeProjectName}"`;
    const html = await render(
      IntegrationExportFailedEmailTemplate({
        copy,
        projectName: safeProjectName,
        settingsUrl,
        disabled,
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
      const emailSchema = z.email();
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
    logger.error(
      `Failed to send ${copy.inlineLabel} export failed email`,
      error,
    );
  }
};
