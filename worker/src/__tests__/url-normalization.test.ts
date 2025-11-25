import { describe, it, expect } from "vitest";
import { validateWebhookURL } from "@langfuse/shared/src/server";

describe("URL Normalization and Edge Cases", () => {
  describe("URL encoding bypass attempts", () => {
    it("should reject URL-encoded localhost", async () => {
      // %6C%6F%63%61%6C%68%6F%73%74 = "localhost"
      await expect(
        validateWebhookURL("http://%6C%6F%63%61%6C%68%6F%73%74/webhook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should reject double-encoded URLs", async () => {
      // Double encoding of "localhost"
      await expect(
        validateWebhookURL(
          "http://%256C%256F%2563%2561%256C%2568%256F%2573%2574/webhook",
        ),
      ).rejects.toThrow(/Invalid URL|Blocked hostname detected/);
    });

    it("should reject mixed case encoding", async () => {
      // Mixed case: %6c%6f%63%61%6c%68%6f%73%74 = "localhost"
      await expect(
        validateWebhookURL("http://%6c%6f%63%61%6c%68%6f%73%74/webhook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should handle partial URL encoding", async () => {
      // Partially encoded: local%68ost = "localhost"
      await expect(
        validateWebhookURL("http://local%68ost/webhook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should reject encoded private IPs", async () => {
      // %31%39%32%2E%31%36%38%2E%31%2E%31 = "192.168.1.1"
      await expect(
        validateWebhookURL("http://%31%39%32%2E%31%36%38%2E%31%2E%31/webhook"),
      ).rejects.toThrow("Blocked IP address detected");
    });
  });

  describe("Unicode and IDN bypass attempts", () => {
    it("should handle unicode domains properly", async () => {
      // These should be converted to punycode and validated
      await expect(
        validateWebhookURL("http://тест.example.com/webhook"),
      ).rejects.toThrow(/DNS lookup failed|Invalid URL/);
    });

    it("should normalize unicode characters", async () => {
      // Unicode variations that could be used for bypassing
      const unicodeVariations = [
        "http://ｌｏｃａｌｈｏｓｔ/webhook", // Fullwidth characters
        "http://localhost\u200d/webhook", // Zero-width joiner
        "http://lօcalhost/webhook", // Armenian O that looks like Latin O
      ];

      for (const url of unicodeVariations) {
        await expect(validateWebhookURL(url)).rejects.toThrow(
          /Blocked hostname detected|Invalid URL|DNS lookup failed/,
        );
      }
    });

    it("should handle homograph attacks", async () => {
      // Cyrillic characters that look like Latin
      await expect(validateWebhookURL("http://ӏocalhost/webhook")) // Cyrillic і that looks like l
        .rejects.toThrow(/Blocked hostname detected|DNS lookup failed/);
    });
  });

  describe("Whitespace and special character handling", () => {
    it("should trim whitespace from URLs", async () => {
      await expect(
        validateWebhookURL("  http://localhost/webhook  "),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should handle newlines and tabs", async () => {
      await expect(
        validateWebhookURL("http://localhost/webhook\n"),
      ).rejects.toThrow("Blocked hostname detected");

      await expect(
        validateWebhookURL("http://localhost/webhook\t"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should handle URLs with unusual characters", async () => {
      await expect(
        validateWebhookURL("http://localhost:80/../webhook"),
      ).rejects.toThrow("Blocked hostname detected");
    });
  });

  describe("Protocol and port edge cases", () => {
    it("should reject case variations of protocols", async () => {
      await expect(
        validateWebhookURL("HTTP://localhost/webhook"),
      ).rejects.toThrow("Blocked hostname detected");

      await expect(
        validateWebhookURL("hTTp://localhost/webhook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should handle implicit ports correctly", async () => {
      // These should not be rejected for port reasons, but for hostname
      await expect(
        validateWebhookURL("http://localhost/webhook"),
      ).rejects.toThrow("Blocked hostname detected");

      await expect(
        validateWebhookURL("https://localhost/webhook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should reject non-standard port formats", async () => {
      await expect(
        validateWebhookURL("http://example.com:08080/webhook"),
      ).rejects.toThrow("Only ports 80 and 443 are allowed");
    });
  });

  describe("IPv6 edge cases", () => {
    it("should handle IPv6 with brackets", async () => {
      await expect(validateWebhookURL("http://[::1]/webhook")).rejects.toThrow(
        /Blocked IP address detected|ipaddr:/,
      );
    });

    it("should handle IPv6 without brackets in URL context", async () => {
      // This should fail URL parsing
      await expect(validateWebhookURL("http://::1/webhook")).rejects.toThrow(
        "Invalid URL syntax",
      );
    });

    it("should handle compressed IPv6 addresses", async () => {
      await expect(
        validateWebhookURL("http://[2001:db8::1]/webhook"),
      ).rejects.toThrow(/Blocked IP address detected|ipaddr:/);
    });

    it("should handle IPv4-mapped IPv6 addresses", async () => {
      await expect(
        validateWebhookURL("http://[::ffff:192.168.1.1]/webhook"),
      ).rejects.toThrow(/Blocked IP address detected|ipaddr:/);
    });
  });

  describe("Malformed URL handling", () => {
    it("should reject URLs with invalid syntax", async () => {
      // URLs that should fail at URL parsing stage
      const invalidSyntaxUrls = [
        "http://",
        "://example.com",
        "http://?",
        "http://#",
        "http://exam ple.com", // Space in hostname
      ];

      // URLs that pass URL parsing but fail DNS resolution
      const invalidDnsUrls = [
        "http://.com",
        "http://.",
        "http://..",
        "http://../",
        "http://invalid-domain-that-should-not-exist-12345.invalid",
      ];

      // Test URLs that fail at parsing
      for (const url of invalidSyntaxUrls) {
        await expect(validateWebhookURL(url)).rejects.toThrow(
          /Invalid URL syntax/,
        );
      }

      // Test URLs that fail at DNS resolution
      for (const url of invalidDnsUrls) {
        await expect(validateWebhookURL(url)).rejects.toThrow(
          /DNS lookup failed/,
        );
      }
    });

    it("should handle URLs with invalid encoding", async () => {
      const invalidEncodedUrls = [
        "http://exam%ple.com/webhook", // Invalid % encoding
        "http://example.com/%ZZ", // Invalid hex in encoding
        "http://example.com/%G1", // Invalid hex characters
      ];

      for (const url of invalidEncodedUrls) {
        await expect(validateWebhookURL(url)).rejects.toThrow(
          /Invalid URL|DNS lookup failed/,
        );
      }
    });
  });

  describe("Boundary conditions", () => {
    it("should handle very long URLs", async () => {
      const longHostname = "a".repeat(253) + ".com"; // Max hostname length
      await expect(
        validateWebhookURL(`https://${longHostname}/webhook`),
      ).rejects.toThrow(/DNS lookup failed/);
    });

    it("should handle URLs with many subdomains", async () => {
      const manySubdomains = Array(50).fill("sub").join(".") + ".example.com";
      await expect(
        validateWebhookURL(`https://${manySubdomains}/webhook`),
      ).rejects.toThrow(/DNS lookup failed/);
    }, 10000);

    it("should handle empty hostname", async () => {
      // This URL is parsed as hostname="webhook" by URL constructor
      // so it fails during DNS resolution, not URL parsing
      await expect(validateWebhookURL("http:///webhook")).rejects.toThrow(
        "DNS lookup failed for webhook",
      );
    });
  });

  describe("Path and query parameter edge cases", () => {
    it("should validate hostname regardless of path", async () => {
      await expect(
        validateWebhookURL(
          "http://localhost/very/long/path/with/many/segments",
        ),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should validate hostname regardless of query parameters", async () => {
      await expect(
        validateWebhookURL("http://localhost/webhook?param=value&other=test"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should validate hostname regardless of fragment", async () => {
      await expect(
        validateWebhookURL("http://localhost/webhook#fragment"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should handle encoded path components", async () => {
      await expect(
        validateWebhookURL("http://localhost/web%20hook"),
      ).rejects.toThrow("Blocked hostname detected");
    });
  });

  describe("Real-world bypass attempts", () => {
    it("should block attempts to access cloud metadata services", async () => {
      const metadataAttempts = [
        "http://169.254.169.254/latest/meta-data/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://metadata/latest/meta-data/",
        "http://169.254.169.254/v1.0/metadata/",
      ];

      for (const url of metadataAttempts) {
        await expect(validateWebhookURL(url)).rejects.toThrow(
          /Blocked|DNS lookup failed/,
        );
      }
    });

    it("should block attempts to access internal services", async () => {
      const internalAttempts = [
        "http://internal/api/health",
        "http://service.internal/status",
        "http://admin.internal/dashboard",
        "http://localhost:8080/admin",
        "http://127.0.0.1:3000/api",
      ];

      for (const url of internalAttempts) {
        await expect(validateWebhookURL(url)).rejects.toThrow(
          /Blocked|Only ports 80 and 443 are allowed/,
        );
      }
    });
  });
});
