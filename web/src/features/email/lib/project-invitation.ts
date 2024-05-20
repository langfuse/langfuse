import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";

import { env } from "@/src/env.mjs";
import ProjectInvitationTemplate from "@/src/features/email/templates/ProjectInvitation";

const langfuseUrls = {
  US: "https://us.cloud.langfuse.com",
  EU: "https://cloud.langfuse.com",
  STAGING: "https://staging.langfuse.com",
};

const authUrl =
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "US" ||
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "EU" ||
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
    ? langfuseUrls[env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION]
    : env.NEXTAUTH_URL;

export const sendProjectInvitation = async (p: {
  to: string;
  inviterName: string;
  inviterEmail: string;
  orgName: string;
}) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    console.error(
      "Missing environment variables for sending project invitation email.",
    );
    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));

    const htmlTemplate = render(
      ProjectInvitationTemplate({
        invitedByUsername: p.inviterName,
        invitedByUserEmail: p.inviterEmail,
        orgName: p.orgName,
        recieverEmail: p.to,
        inviteLink: authUrl,
        langfuseCloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      }),
    );

    await mailer.sendMail({
      to: p.to,
      from: {
        address: env.EMAIL_FROM_ADDRESS,
        name: "Langfuse",
      },
      subject: `${p.inviterName} invited you to join "${p.orgName}" organization on Langfuse`,
      html: htmlTemplate,
    });
  } catch (error) {
    console.error(error);
  }
};
