import { describe, it, expect } from "vitest";
import { validateWebhookURL } from "@langfuse/shared/src/server";

describe("Webhook URL Validation", () => {
  describe("validateWebhookURL", () => {
    it("should accept valid public HTTPS URLs", async () => {
      await expect(
        validateWebhookURL("https://httpbin.org/post"),
      ).resolves.not.toThrow();
    });

    it("should accept valid public HTTP URLs", async () => {
      await expect(
        validateWebhookURL("http://httpbin.org/post"),
      ).resolves.not.toThrow();
    });

    it("should reject invalid URL syntax", async () => {
      await expect(validateWebhookURL("not-a-url")).rejects.toThrow(
        "Invalid URL syntax",
      );
    });

    it("should reject non-HTTP/HTTPS protocols", async () => {
      await expect(validateWebhookURL("ftp://example.com")).rejects.toThrow(
        "Only HTTP and HTTPS protocols are allowed",
      );
      await expect(validateWebhookURL("file:///etc/passwd")).rejects.toThrow(
        "Only HTTP and HTTPS protocols are allowed",
      );
    });

    it("should reject disallowed ports", async () => {
      await expect(
        validateWebhookURL("https://example.com:8080/hook"),
      ).rejects.toThrow("Only ports 80 and 443 are allowed");
      await expect(
        validateWebhookURL("http://example.com:3000/hook"),
      ).rejects.toThrow("Only ports 80 and 443 are allowed");
    });

    it("should allow standard ports", async () => {
      await expect(
        validateWebhookURL("https://httpbin.org:443/post"),
      ).resolves.not.toThrow();
      await expect(
        validateWebhookURL("http://httpbin.org:80/post"),
      ).resolves.not.toThrow();
    });

    it("should reject localhost URLs", async () => {
      await expect(validateWebhookURL("http://localhost/hook")).rejects.toThrow(
        "Blocked hostname detected",
      );
      await expect(
        validateWebhookURL("http://test.localhost/hook"),
      ).rejects.toThrow("Blocked hostname detected");
      // Generic error message without IP address
      await expect(
        validateWebhookURL("https://127.0.0.1/hook"),
      ).rejects.toThrow("Blocked IP address detected");
      await expect(validateWebhookURL("http://[::1]/hook")).rejects.toThrow(
        /Blocked IP address detected|ipaddr:/,
      );
    });

    it("should reject private network URLs", async () => {
      // Generic error messages without exposing IP addresses
      await expect(
        validateWebhookURL("http://192.168.1.1/hook"),
      ).rejects.toThrow("Blocked IP address detected");
      await expect(validateWebhookURL("http://10.0.0.1/hook")).rejects.toThrow(
        "Blocked IP address detected",
      );
      await expect(
        validateWebhookURL("http://172.16.0.1/hook"),
      ).rejects.toThrow("Blocked IP address detected");
    });

    it("should reject link-local addresses", async () => {
      await expect(
        validateWebhookURL("http://169.254.169.254/hook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should reject multicast addresses", async () => {
      // Generic error message without exposing IP address
      await expect(validateWebhookURL("http://224.0.0.1/hook")).rejects.toThrow(
        "Blocked IP address detected",
      );
    });

    it("should reject broadcast addresses", async () => {
      // Generic error message without exposing IP address
      await expect(
        validateWebhookURL("http://255.255.255.255/hook"),
      ).rejects.toThrow("Blocked IP address detected");
    });

    it("should reject IPv6 private addresses", async () => {
      // Generic error messages without exposing IP addresses
      await expect(validateWebhookURL("http://[fc00::1]/hook")).rejects.toThrow(
        /Blocked IP address detected|ipaddr:/,
      );
      await expect(validateWebhookURL("http://[fe80::1]/hook")).rejects.toThrow(
        /Blocked IP address detected|ipaddr:/,
      );
    });

    it("should handle DNS resolution failures gracefully", async () => {
      await expect(
        validateWebhookURL(
          "https://this-domain-definitely-does-not-exist-12345.com/hook",
        ),
      ).rejects.toThrow("DNS lookup failed");
    });

    it("should reject URL-encoded localhost bypass attempts", async () => {
      // %6C%6F%63%61%6C%68%6F%73%74 decodes to "localhost" but fails on port check first
      await expect(
        validateWebhookURL("http://%6C%6F%63%61%6C%68%6F%73%74/hook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should reject internal/intranet hostnames", async () => {
      // Note: "internal.company.com" would require DNS resolution which can timeout
      // Using domains that match blocked patterns directly for faster tests
      await expect(
        validateWebhookURL("http://service.internal/hook"),
      ).rejects.toThrow("Blocked hostname detected");
      await expect(
        validateWebhookURL("http://app.internal/hook"),
      ).rejects.toThrow("Blocked hostname detected");
      await expect(validateWebhookURL("http://intranet/hook")).rejects.toThrow(
        "Blocked hostname detected",
      );
    });

    it("should reject docker internal hostnames", async () => {
      await expect(
        validateWebhookURL("http://host.docker.internal/hook"),
      ).rejects.toThrow("Blocked hostname detected");
      await expect(
        validateWebhookURL("http://gateway.docker.internal/hook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should reject cloud metadata endpoints", async () => {
      await expect(
        validateWebhookURL("http://metadata.google.internal/hook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should handle malformed URL encoding", async () => {
      await expect(
        validateWebhookURL("http://exam%ple.com/hook"),
      ).rejects.toThrow(/Invalid URL encoding|Invalid URL syntax/);
    });

    it("should allow local hostname, if it is included in the whitelist", async () => {
      await expect(
        validateWebhookURL("http://internal.company.com/hook", {
          hosts: ["internal.company.com"],
          ips: [],
          ip_ranges: [],
        }),
      ).resolves.not.toThrow();
      await expect(
        validateWebhookURL("http://app.internal/hook", {
          hosts: ["app.internal"],
          ips: [],
          ip_ranges: [],
        }),
      ).resolves.not.toThrow();
      await expect(
        validateWebhookURL("http://intranet/hook", {
          hosts: ["intranet"],
          ips: [],
          ip_ranges: [],
        }),
      ).resolves.not.toThrow();
    });
  });
});
