import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { createTransport, type Transporter } from "nodemailer";
import type SESTransport from "nodemailer/lib/ses-transport/index.js";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";

function parseSesRegion(connectionUrl: string): string {
  const url = new URL(connectionUrl);
  // `new URL("ses://us-east-1")` puts the region in `host`, not `pathname`.
  const region = url.host;
  if (!region) {
    throw new Error(
      "Invalid SES connection URL: missing region. Expected `ses://<region>` (e.g. `ses://us-east-1`).",
    );
  }
  return region;
}

function buildSesTransportOptions(connectionUrl: string): SESTransport.Options {
  const region = parseSesRegion(connectionUrl);
  const sesClient = new SESv2Client({ region });
  return { SES: { sesClient, SendEmailCommand } } as SESTransport.Options;
}

// Returns a ready-to-use nodemailer Transporter. Dispatches on the URL scheme:
//   `ses://<region>` -> AWS SES via SESv2Client + default AWS credential chain
//   anything else    -> classic SMTP via parseConnectionUrl
export function createMailTransport(connectionUrl: string): Transporter {
  if (connectionUrl.startsWith("ses://")) {
    return createTransport(buildSesTransportOptions(connectionUrl));
  }
  return createTransport(parseConnectionUrl(connectionUrl));
}

export const __testing = { parseSesRegion };
