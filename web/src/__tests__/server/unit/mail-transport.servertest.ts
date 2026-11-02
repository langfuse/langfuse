import { describe, expect, it } from "vitest";

import { __testing, createMailTransport } from "@langfuse/shared/src/server";

const { parseSesRegion } = __testing;

// Replica of next-auth/utils/merge.js (v4.24.x), used to verify EmailProvider's
// `server` value is safe to deep-merge — NextAuth runs this on every request.
function nextAuthMerge(target: any, ...sources: any[]): any {
  const isObject = (item: unknown) =>
    item != null && typeof item === "object" && !Array.isArray(item);
  if (!sources.length) return target;
  const source = sources.shift();
  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        nextAuthMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }
  return nextAuthMerge(target, ...sources);
}

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

  describe("NextAuth EmailProvider.server must be merge-safe", () => {
    it.each([
      "smtp://user:pass@host:25",
      "smtps://AKIAEXAMPLE:secret@email-smtp.us-east-1.amazonaws.com:465",
      "ses://us-east-1",
    ])("does not blow NextAuth's deep merge for %s", (server) => {
      expect(() => nextAuthMerge({}, { server })).not.toThrow();
    });
  });
});
