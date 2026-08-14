import { render } from "@react-email/render";
import { createMailTransport } from "../transport";
import { z } from "zod";
import { sanitizeEmailSubject } from "../../../../utils/zod";
import { logger } from "../../../logger";
import { PostHogExportFailedEmailTemplate } from "./PostHogExportFailedEmailTemplate";

export type SendPostHogExportFailedEmailParams = {
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
  // When true, the export was disabled after a configuration fault (needs the
  // customer to fix the host and re-enable) rather than a transient failure.
  disabled?: boolean;
};

export const sendPostHogExportFailedEmail = async ({
  env,
  projectName,
  settingsUrl,
  receiverEmails,
  disabled = false,
}: SendPostHogExportFailedEmailParams) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending PostHog export failed email.",
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
      ? `PostHog export disabled for "${safeProjectName}" – action required`
      : `PostHog export failed for "${safeProjectName}"`;
    const html = await render(
      PostHogExportFailedEmailTemplate({
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
    logger.error("Failed to send PostHog export failed email", error);
  }
};
