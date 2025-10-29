import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";

import { CommentMentionEmailTemplate } from "./CommentMentionEmailTemplate";
import { logger } from "../../../logger";
import { sanitizeEmailSubject } from "../../../../utils/zod";

type SendCommentMentionEmailParams = {
  env: Partial<
    Record<"EMAIL_FROM_ADDRESS" | "SMTP_CONNECTION_URL", string | undefined>
  >;
  mentionedUserName: string;
  mentionedUserEmail: string;
  authorName?: string; // Optional - undefined if author deleted or not project member
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
    // Sanitize the comment preview to prevent HTML/CRLF injection before rendering into HTML
    const safeCommentPreview = sanitizeEmailSubject(commentPreview);
    const htmlTemplate = await render(
      CommentMentionEmailTemplate({
        mentionedUserName,
        mentionedUserEmail,
        authorName,
        projectName,
        commentPreview: safeCommentPreview,
        commentLink,
        settingsLink,
      }),
    );

    // Sanitize authorName and projectName to prevent email header injection attacks
    const safeProjectName = sanitizeEmailSubject(projectName);
    const safeAuthorName = authorName
      ? sanitizeEmailSubject(authorName)
      : undefined;

    const subject = safeAuthorName
      ? `${safeAuthorName} mentioned you in project ${safeProjectName}`
      : `You were mentioned in a comment in project ${safeProjectName}`;

    await mailer.sendMail({
      to: mentionedUserEmail,
      from: {
        address: env.EMAIL_FROM_ADDRESS,
        name: "Langfuse",
      },
      subject,
      html: htmlTemplate,
    });

    logger.info("Comment mention email sent successfully");
  } catch (error) {
    logger.error("Failed to send comment mention email", error);
  }
};
