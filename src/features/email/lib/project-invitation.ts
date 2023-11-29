import { env } from "@/src/env.mjs";
import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";

export const sendProjectInvitation = async (
  to: string,
  inviterName: string,
  projectName: string,
) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    console.error(
      "Missing environment variables for sending project invitation email.",
    );
    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));

    await mailer.sendMail({
      to: to,
      from: {
        address: env.EMAIL_FROM_ADDRESS,
        name: "Langfuse",
      },
      subject: `${inviterName} invited you to join "${projectName}"`,
      html: `
      <p>${inviterName} invited you to join "${projectName}" on Langfuse.</p>
      <p><a href="${env.NEXTAUTH_URL}">Accept Invitation</a> (you need to create an account)</p>
      `,
    });
  } catch (error) {
    console.error(error);
  }
};
