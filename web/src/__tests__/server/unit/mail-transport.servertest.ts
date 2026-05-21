import { describe, expect, it } from "vitest";

import {
  __testing,
  buildMailServerConfig,
  createMailTransport,
} from "@langfuse/shared/src/server";

const { parseSesRegion } = __testing;

describe("mail transport dispatch", () => {
  describe("parseSesRegion", () => {
    it("extracts the region from ses://<region>", () => {
      expect(parseSesRegion("ses://us-east-1")).toBe("us-east-1");
      expect(parseSesRegion("ses://eu-west-2")).toBe("eu-west-2");
    });

    it("throws when no region is supplied", () => {
      expect(() => parseSesRegion("ses://")).toThrow(/missing region/i);
    });
  });

  describe("createMailTransport", () => {
    it("builds an SMTP transport from an smtp:// URL", () => {
      const transport = createMailTransport("smtp://user:pass@host:25");
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
      expect(transport.transporter.name).toBe("SESTransport");
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
