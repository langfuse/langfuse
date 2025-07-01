import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";

import { CommentMentionEmailTemplate } from "./CommentMentionEmailTemplate";
import { logger } from "../../../logger";

const langfuseUrls = {
  US: "https://us.cloud.langfuse.com",
  EU: "https://cloud.langfuse.com",
  STAGING: "https://staging.langfuse.com",
  HIPAA: "https://hipaa.cloud.langfuse.com",
};

type SendCommentMentionParams = {
  env: Partial<
    Record<
      | "EMAIL_FROM_ADDRESS"
      | "SMTP_CONNECTION_URL"
      | "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION"
      | "NEXTAUTH_URL",
      string | undefined
    >
  >;
  to: string;
  mentionedByName: string;
  mentionedByEmail: string;
  commentContent: string;
  objectType: string;
  objectId: string;
  projectName: string;
  orgName: string;
  objectLink: string;
};

export const sendCommentMentionEmail = async ({
  env,
  to,
  mentionedByName,
  mentionedByEmail,
  commentContent,
  objectType,
  objectId,
  projectName,
  orgName,
  objectLink,
}: SendCommentMentionParams) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending comment mention email."
    );
    return;
  }

  const getBaseURL = () =>
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "US" ||
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "EU" ||
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "HIPAA" ||
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
      ? langfuseUrls[env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION]
      : env.NEXTAUTH_URL;

  const baseUrl = getBaseURL();
  if (!baseUrl) {
    logger.error(
      "Missing NEXTAUTH_URL or NEXT_PUBLIC_LANGFUSE_CLOUD_REGION environment variable."
    );
    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));

    const htmlTemplate = await render(
      CommentMentionEmailTemplate({
        mentionedByName,
        mentionedByEmail,
        commentContent,
        objectType,
        objectId,
        projectName,
        orgName,
        objectLink,
        receiverEmail: to,
        emailFromAddress: env.EMAIL_FROM_ADDRESS,
        langfuseCloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      })
    );

    await mailer.sendMail({
      to,
      from: `Langfuse <${env.EMAIL_FROM_ADDRESS}>`,
      subject: `${mentionedByName} mentioned you in a comment on ${projectName}`,
      html: htmlTemplate,
    });
  } catch (error) {
    logger.error("Failed to send comment mention email", error);
  }
};