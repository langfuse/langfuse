import { env } from "@/src/env.mjs";
import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";

export const sendProjectInvitation = async (
  to: string,
  inviterName: string,
  projectName: string,
) => {
  try {
    const emailTitle = `${inviterName} invited you to ${projectName}`;

    if (!env.SMTP_CONNECTION_URL) {
      throw new Error("SMTP_CONNECTION_URL is required.");
    }
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));

    const info = await mailer.sendMail({
      to: to,
      from: {
        address: env.EMAIL_FROM_ADDRESS ?? "team_langfuse@langfuse.com",
        name: env.EMAIL_FROM_NAME ?? "Langfuse",
      },
      subject: emailTitle,
      html: `
      <p>${inviterName} invited you to ${projectName}. Click following to become part of project.</p>
      <a href="${env.NEXTAUTH_URL}">Accept Invitation</a>
      `,
    });

    return info;
  } catch (error) {
    console.error(error);
  }
};
