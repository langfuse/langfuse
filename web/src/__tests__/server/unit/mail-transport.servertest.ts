import { describe, expect, it } from "vitest";

import {
  buildMailServerConfig,
  createMailTransport,
} from "@langfuse/shared/src/server";

describe("mail transport dispatch", () => {
  describe("createMailTransport", () => {
    it("builds an SMTP transport from an smtp:// URL", () => {
      const transport = createMailTransport("smtp://user:pass@host:25");
      // nodemailer's SMTP transport exposes a `name` of "SMTP".
      expect(transport.transporter.name).toBe("SMTP");
    });

    it("builds an SMTP transport from an smtps:// URL (SES-over-SMTP unchanged)", () => {
      const transport = createMailTransport(
        "smtps://AKIAEXAMPLE:secret@email-smtp.us-east-1.amazonaws.com:465",
      );
      expect(transport.transporter.name).toBe("SMTP");
    });

    it("builds an SES transport when the URL uses ses:// with a region", () => {
      const transport = createMailTransport("ses://us-east-1");
      expect(transport.transporter.name).toBe("SES");
      // The configured SESv2 client must report the region from the URL.
      // nodemailer keeps the SES options on `transporter.ses`.
      const ses = (
        transport.transporter as unknown as {
          ses: {
            sesClient: {
              config: { region: () => Promise<string> | string };
            };
          };
        }
      ).ses;
      const region = ses.sesClient.config.region;
      const resolved = typeof region === "function" ? region() : region;
      return Promise.resolve(resolved).then((r) => {
        expect(r).toBe("us-east-1");
      });
    });

    it("throws when ses:// is supplied without a region", () => {
      expect(() => createMailTransport("ses://")).toThrow(/missing region/i);
    });
  });

  describe("buildMailServerConfig", () => {
    it("returns the raw URL for SMTP connection strings", () => {
      const url = "smtp://user:pass@host:25";
      expect(buildMailServerConfig(url)).toBe(url);
    });

    it("returns a nodemailer SES options object for ses:// URLs", () => {
      const config = buildMailServerConfig("ses://eu-west-1") as {
        SES: { sesClient: unknown; SendEmailCommand: unknown };
      };
      expect(config).toHaveProperty("SES.sesClient");
      expect(config).toHaveProperty("SES.SendEmailCommand");
    });
  });
});
