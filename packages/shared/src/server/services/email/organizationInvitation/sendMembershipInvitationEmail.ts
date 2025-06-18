import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";

import MembershipInvitationTemplate from "./MembershipInvitationEmailTemplate";
import { logger } from "../../../logger";

const langfuseUrls = {
  US: "https://us.cloud.langfuse.com",
  EU: "https://cloud.langfuse.com",
  STAGING: "https://staging.langfuse.com",
  HIPAA: "https://hipaa.cloud.langfuse.com",
};

type SendMembershipInvitationParams = {
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
  inviterName: string;
  inviterEmail: string;
  orgName: string;
};

export const sendMembershipInvitationEmail = async ({
  env,
  to,
  inviterName,
  inviterEmail,
  orgName,
}: SendMembershipInvitationParams) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending membership invitation email.",
    );
    return;
  }

  const getAuthURL = () =>
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "US" ||
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "EU" ||
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "HIPAA" ||
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
      ? langfuseUrls[env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION]
      : env.NEXTAUTH_URL;

  const authUrl = getAuthURL();
  if (!authUrl) {
    logger.error(
      "Missing NEXTAUTH_URL or NEXT_PUBLIC_LANGFUSE_CLOUD_REGION environment variable.",
    );
    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));

    const htmlTemplate = await render(
      MembershipInvitationTemplate({
        invitedByUsername: inviterName,
        invitedByUserEmail: inviterEmail,
        orgName: orgName,
        receiverEmail: to,
        inviteLink: authUrl,
        emailFromAddress: env.EMAIL_FROM_ADDRESS,
        langfuseCloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      }),
    );

    await mailer.sendMail({
      to,
      from: `Langfuse <${env.EMAIL_FROM_ADDRESS}>`,
      subject: `${inviterName} invited you to join "${orgName}" organization on Langfuse`,
      html: htmlTemplate,
    });
  } catch (error) {
    logger.error(error);
  }
};
