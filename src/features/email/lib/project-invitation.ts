import { createTransport } from 'nodemailer';
import { Resend } from 'resend';

import { projectInvitationTemplate } from '@/src/features/email/templates/ProjectInvitation';

export const sendProjectInvitation = async (to: string, senderName: string, projectName: string) => {
  try {
    const transportChannel = process.env.EMAIL_TRANSPORT_CHANNEL ?? "smtp"
    const html_template = projectInvitationTemplate(senderName, to, projectName);

    const fromName = process.env.EMAIL_FROM_NAME ?? 'Langfuse';
    const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? 'team_langfuse@langfuse.com';

    if (transportChannel === "resend") {
      if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_CHANNEL requires RESEND_API_KEY");
        return;
      }

      const resend = new Resend(process.env.RESEND_API_KEY);

      const data = await resend.emails.send({
        from: `${fromName} <${fromAddress}>`,
        to: `${to}`,
        subject: "Langfuse Project Invitation",
        html: html_template,
      });

      return data;
    } else if (transportChannel === "smtp") {
      if (!process.env.SMTP_HOST) {
        throw new Error("SMTP_CHANNEL requires SMTP_HOST");
        return;
      }

      const transporter = createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_AUTH_USERNAME ?? '',
          pass: process.env.SMTP_AUTH_PASSWORD ?? '',
        },
      });

      const info = await transporter.sendMail({
        from: `${fromName} <${fromAddress}>`,
        to: `${to}`,
        subject: "Langfuse Project Invitation",
        html: html_template,
      });

      return info;
    } else {
      throw new Error("EMAIL_TRANSPORT_CHANNEL is not supported");
    }

    return;
  } catch (error: any) {
    console.error(error);

    throw new Error(error.message);
  }
};
