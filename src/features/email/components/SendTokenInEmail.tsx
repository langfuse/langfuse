import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";

import { env } from "@/src/env.mjs";
import ChangePasswordTemplate from "@/src/features/email/templates/ChangePassword";

const langfuseUrls = {
  US: "https://us.cloud.langfuse.com",
  EU: "https://cloud.langfuse.com",
  STAGING: "https://staging.langfuse.com",
};

export const SendTokenInEmail = async (email: string, token: string) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    console.error(
      "Missing environment variables for sending change password email.",
    );
    return;
  }
  let authUrl = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
    ? langfuseUrls[env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION]
    : env.NEXTAUTH_URL;

  authUrl = authUrl.concat(`/user/change-password/${token}/${email}`);
  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));
    const htmlTemplate = render(
      ChangePasswordTemplate({
        recieverEmail: String(email),
        inviteLink: authUrl,
      }),
    );
    await mailer.sendMail({
      to: email,
      from: {
        address: String(env.EMAIL_FROM_ADDRESS),
        name: "Langfuse",
      },
      subject: `Reset Password Notification for your Langfuse Account"`,
      html: htmlTemplate,
    });
  } catch (error) {
    console.log(error);
  }
};
