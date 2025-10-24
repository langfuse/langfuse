import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";

import { CommentMentionEmailTemplate } from "./CommentMentionEmailTemplate";
import { logger } from "../../../logger";

type SendCommentMentionEmailParams = {
  env: Partial<
    Record<"EMAIL_FROM_ADDRESS" | "SMTP_CONNECTION_URL", string | undefined>
  >;
  mentionedUserName: string;
  mentionedUserEmail: string;
  authorName: string;
  projectName: string;
  commentPreview: string;
  commentLink: string;
  settingsLink: string;
};

export const sendCommentMentionEmail = async ({
  env,
  mentionedUserName,
  mentionedUserEmail,
  authorName,
  projectName,
  commentPreview,
  commentLink,
  settingsLink,
}: SendCommentMentionEmailParams) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error("Missing environment variables for sending email.");
    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));
    const htmlTemplate = await render(
      CommentMentionEmailTemplate({
        mentionedUserName,
        mentionedUserEmail,
        authorName,
        projectName,
        commentPreview,
        commentLink,
        settingsLink,
      }),
    );

    await mailer.sendMail({
      to: mentionedUserEmail,
      from: {
        address: env.EMAIL_FROM_ADDRESS,
        name: "Langfuse",
      },
      subject: `${authorName} mentioned you in project ${projectName}`,
      html: htmlTemplate,
    });

    logger.info("Comment mention email sent successfully");
  } catch (error) {
    logger.error("Failed to send comment mention email", error);
  }
};
