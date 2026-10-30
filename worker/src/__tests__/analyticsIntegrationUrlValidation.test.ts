/**
 * Use-time URL check for analytics exporters: IP literals, embedded
 * credentials, and non-HTTP schemes. Named hosts are left to connect-time
 * pinning (see analyticsIntegrationSsrfPinning.test.ts).
 *
 * Passes an empty allowlist explicitly so a developer-local webhook
 * allowlist cannot make these assertions vacuous.
 */
import { describe, expect, it } from "vitest";
import { OutboundUrlValidationError } from "@langfuse/shared/src/server";
import {
  hostnameForLog,
  validateAnalyticsIntegrationUrl,
} from "../features/analyticsIntegrationEgress";

const EMPTY_ALLOWLIST = { hosts: [], ips: [], ip_ranges: [] };

const blockedIpLiterals: Array<[string, string]> = [
  ["loopback literal", "http://127.0.0.1/"],
  ["IPv6 loopback literal", "http://[::1]/"],
  ["cloud metadata literal", "http://169.254.169.254/"],
  ["RFC1918 literal", "http://10.0.0.5/"],
];

describe("validateAnalyticsIntegrationUrl", () => {
  it.each(blockedIpLiterals)("rejects a %s", (_label, url) => {
    expect(() =>
      validateAnalyticsIntegrationUrl(url, EMPTY_ALLOWLIST),
    ).toThrowError(OutboundUrlValidationError);
    try {
      validateAnalyticsIntegrationUrl(url, EMPTY_ALLOWLIST);
    } catch (error) {
      expect((error as OutboundUrlValidationError).code).toBe("blocked-ip");
    }
  });

  it("rejects embedded credentials without echoing the password", () => {
    expect(() =>
      validateAnalyticsIntegrationUrl(
        "http://exporter:hunter2@127.0.0.1/",
        EMPTY_ALLOWLIST,
      ),
    ).toThrowError(OutboundUrlValidationError);

    try {
      validateAnalyticsIntegrationUrl(
        "http://exporter:hunter2@127.0.0.1/",
        EMPTY_ALLOWLIST,
      );
    } catch (error) {
      expect((error as OutboundUrlValidationError).code).toBe(
        "url-credentials-not-allowed",
      );
      expect(String((error as Error).message)).not.toContain("hunter2");
    }
  });

  it("rejects a non-HTTP(S) scheme", () => {
    expect(() =>
      validateAnalyticsIntegrationUrl("ftp://10.0.0.1/", EMPTY_ALLOWLIST),
    ).toThrowError(OutboundUrlValidationError);
    try {
      validateAnalyticsIntegrationUrl("ftp://10.0.0.1/", EMPTY_ALLOWLIST);
    } catch (error) {
      expect((error as OutboundUrlValidationError).code).toBe(
        "protocol-not-allowed",
      );
    }
  });

  it("does not DNS-check a named host (connect-time pinning owns that)", () => {
    expect(() =>
      validateAnalyticsIntegrationUrl(
        "https://api.mixpanel.com/import?strict=1",
        EMPTY_ALLOWLIST,
      ),
    ).not.toThrow();
    // localhost is a name, not a literal; this check must not pretend to
    // have blocked it, or a later connect-time regression could hide here.
    expect(() =>
      validateAnalyticsIntegrationUrl("http://localhost/", EMPTY_ALLOWLIST),
    ).not.toThrow();
  });
});

describe("hostnameForLog", () => {
  it("returns only the hostname from a credentialed URL", () => {
    expect(
      hostnameForLog("http://admin:hunter2@posthog.example.com/batch"),
    ).toBe("posthog.example.com");
  });

  it("marks an unparsable value instead of throwing", () => {
    expect(hostnameForLog("not a url")).toBe("<unparsable>");
  });
});
