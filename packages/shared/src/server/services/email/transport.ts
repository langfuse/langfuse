import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { createTransport, type Transporter } from "nodemailer";
import type SESTransport from "nodemailer/lib/ses-transport/index.js";
import { parseConnectionUrl } from "nodemailer/lib/shared/index.js";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";

// NextAuth's EmailProvider `server` accepts either a connection URL string or
// a nodemailer transport-options object. We return the same shape so callers
// can hand the result directly to EmailProvider({ server }).
export type MailServerConfig =
  | string
  | SMTPTransport.Options
  | SESTransport.Options;

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

// Returns the value to pass to NextAuth's EmailProvider `server` field.
// For SMTP this is the original URL string (NextAuth parses it internally);
// for SES this is the transport-options object that nodemailer needs.
export function buildMailServerConfig(connectionUrl: string): MailServerConfig {
  if (connectionUrl.startsWith("ses://")) {
    return buildSesTransportOptions(connectionUrl);
  }
  return connectionUrl;
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
