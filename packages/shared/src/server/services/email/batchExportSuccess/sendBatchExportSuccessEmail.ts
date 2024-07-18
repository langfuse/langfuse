import { createTransport } from "nodemailer";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import { render } from "@react-email/render";

import { BatchExportSuccessEmailTemplate } from "./BatchExportSuccessEmailTemplate";

type SendBatchExportSuccessParams = {
  env: Partial<
    Record<"EMAIL_FROM_ADDRESS" | "SMTP_CONNECTION_URL", string | undefined>
  >;
  receiverEmail: string;
  downloadLink: string;
  userName: string;
  batchExportName: string;
  expiresInHours: number;
};

export const sendBatchExportSuccessEmail = async ({
  env,
  receiverEmail,
  downloadLink,
  userName,
  batchExportName,
  expiresInHours,
}: SendBatchExportSuccessParams) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    console.error("Missing environment variables for sending email.");

    return;
  }

  try {
    const mailer = createTransport(parseConnectionUrl(env.SMTP_CONNECTION_URL));
    const htmlTemplate = render(
      BatchExportSuccessEmailTemplate({
        receiverEmail,
        downloadLink,
        userName,
        batchExportName,
        expiresInHours,
      })
    );

    await mailer.sendMail({
      to: receiverEmail,
      from: {
        address: env.EMAIL_FROM_ADDRESS,
        name: "Langfuse",
      },
      subject: "Your data export is ready",
      html: htmlTemplate,
    });
  } catch (error) {
    console.error(error);
  }
};
