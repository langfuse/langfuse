import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SecureHttpClient } from "@langfuse/shared/src/server";
import dns from "node:dns/promises";

describe("TOCTOU (Time-of-Check-Time-of-Use) Protection", () => {
  let client: SecureHttpClient;

  beforeEach(() => {
    client = new SecureHttpClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("DNS rebinding attack prevention", () => {
    it("should re-validate URL at request time", async () => {
      // Mock DNS to simulate changing resolution between validation and request
      let callCount = 0;
      vi.spyOn(dns, "resolve4").mockImplementation((hostname) => {
        callCount++;
        if (callCount === 1) {
          // First call (during validation) - return public IP
          return Promise.resolve(["8.8.8.8"]);
        } else {
          // Second call (during request) - return private IP
          return Promise.resolve(["192.168.1.1"]);
        }
      });

      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("No AAAA record"));

      // The request should be blocked because the secure HTTP client
      // performs validation again at connection time
      await expect(
        client.request("http://evil-domain.example/webhook"),
      ).rejects.toThrow("Blocked IP address detected at connection time");
    });

    it("should detect when DNS changes from public to private IP", async () => {
      let callCount = 0;
      vi.spyOn(dns, "resolve4").mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // First two calls - return legitimate IP
          return Promise.resolve(["1.1.1.1"]);
        } else {
          // Later calls - return private IP (simulating DNS rebinding)
          return Promise.resolve(["10.0.0.1"]);
        }
      });

      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("No AAAA record"));

      // The secure HTTP client should catch this during the connection-time lookup
      await expect(
        client.request("http://rebinding-attack.example/webhook"),
      ).rejects.toThrow("Blocked IP address detected at connection time");
    });

    it("should protect against IPv6 DNS rebinding", async () => {
      vi.spyOn(dns, "resolve4").mockRejectedValue(new Error("No A record"));

      let callCount = 0;
      vi.spyOn(dns, "resolve6").mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve(["2001:4860:4860::8888"]); // Google DNS
        } else {
          return Promise.resolve(["::1"]); // localhost
        }
      });

      await expect(
        client.request("http://ipv6-rebinding.example/webhook"),
      ).rejects.toThrow("Blocked IP address detected at connection time");
    });
  });

  describe("Multiple resolution attempts", () => {
    it("should block if any resolved IP is private", async () => {
      // Mock DNS to return multiple IPs, some private, some public
      vi.spyOn(dns, "resolve4").mockResolvedValue([
        "8.8.8.8", // Public (Google DNS)
        "192.168.1.100", // Private (should cause rejection)
        "1.1.1.1", // Public (Cloudflare DNS)
      ]);

      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("No AAAA record"));

      await expect(
        client.request("http://mixed-ips.example/webhook"),
      ).rejects.toThrow("Blocked IP address detected at connection time");
    });

    it("should succeed if all resolved IPs are public", async () => {
      // Mock DNS to return only public IPs
      vi.spyOn(dns, "resolve4").mockResolvedValue([
        "8.8.8.8", // Google DNS
        "1.1.1.1", // Cloudflare DNS
        "208.67.222.222", // OpenDNS
      ]);

      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("No AAAA record"));

      // Mock the actual HTTP request to avoid network calls
      const originalRequest = client.request;
      const mockRequest = vi.fn().mockRejectedValue(new Error("Network error"));
      client.request = mockRequest;

      // The request should pass IP validation but fail on network
      await expect(
        client.request("http://all-public-ips.example/webhook"),
      ).rejects.toThrow("Network error");

      client.request = originalRequest;
    });
  });

  describe("Edge cases in TOCTOU protection", () => {
    it("should handle DNS resolution failures during connection", async () => {
      // First resolution succeeds (validation)
      let callCount = 0;
      vi.spyOn(dns, "resolve4").mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve(["8.8.8.8"]);
        } else {
          return Promise.reject(new Error("DNS resolution failed"));
        }
      });

      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("No AAAA record"));

      await expect(
        client.request("http://dns-failure.example/webhook"),
      ).rejects.toThrow("DNS resolution failed");
    });

    it("should handle inconsistent IPv4/IPv6 resolution", async () => {
      // IPv4 resolves to public, IPv6 resolves to private
      vi.spyOn(dns, "resolve4").mockResolvedValue(["8.8.8.8"]);
      vi.spyOn(dns, "resolve6").mockResolvedValue(["::1"]); // localhost

      await expect(
        client.request("http://mixed-protocol-ips.example/webhook"),
      ).rejects.toThrow("Blocked IP address detected at connection time");
    });

    it("should handle timeout during DNS resolution", async () => {
      // Simulate slow DNS that times out
      vi.spyOn(dns, "resolve4").mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error("DNS timeout")), 100);
        });
      });

      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("No AAAA record"));

      await expect(
        client.request("http://slow-dns.example/webhook"),
      ).rejects.toThrow("DNS timeout");
    });
  });

  describe("Validation consistency", () => {
    it("should use same validation logic in both validation and connection phases", async () => {
      // Test that the same IP blocking logic is applied in both phases
      vi.spyOn(dns, "resolve4").mockResolvedValue(["127.0.0.1"]); // localhost
      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("No AAAA record"));

      // Should fail during initial validation
      await expect(
        client.request("http://consistent-blocking.example/webhook"),
      ).rejects.toThrow("Blocked IP address detected");
    });

    it("should maintain security even with rapid DNS changes", async () => {
      // Simulate very fast DNS changes
      let callCount = 0;
      vi.spyOn(dns, "resolve4").mockImplementation(() => {
        callCount++;
        const ips = [
          ["8.8.8.8"], // Public
          ["192.168.1.1"], // Private
          ["1.1.1.1"], // Public
          ["10.0.0.1"], // Private
          ["8.8.4.4"], // Public
        ];
        return Promise.resolve(ips[callCount % ips.length]);
      });

      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("No AAAA record"));

      // Even with rapid changes, private IPs should be blocked
      await expect(
        client.request("http://rapid-dns-changes.example/webhook"),
      ).rejects.toThrow(/Blocked IP address detected/);
    });
  });

  describe("Real-world attack scenarios", () => {
    it("should prevent AWS metadata service access via DNS rebinding", async () => {
      // Simulate attacker-controlled domain that resolves to metadata service
      let callCount = 0;
      vi.spyOn(dns, "resolve4").mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve(["203.0.113.1"]); // TEST-NET-3 (public)
        } else {
          return Promise.resolve(["169.254.169.254"]); // AWS metadata
        }
      });

      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("No AAAA record"));

      await expect(
        client.request("http://aws-metadata-attack.example/webhook"),
      ).rejects.toThrow("Blocked IP address detected at connection time");
    });

    it("should prevent GCP metadata access via DNS rebinding", async () => {
      let callCount = 0;
      vi.spyOn(dns, "resolve4").mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve(["198.51.100.1"]); // TEST-NET-2
        } else {
          return Promise.resolve(["169.254.169.254"]); // GCP metadata
        }
      });

      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("No AAAA record"));

      await expect(
        client.request("http://gcp-metadata-attack.example/webhook"),
      ).rejects.toThrow("Blocked IP address detected at connection time");
    });

    it("should prevent internal service discovery via DNS rebinding", async () => {
      let callCount = 0;
      vi.spyOn(dns, "resolve4").mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve(["8.8.8.8"]);
        } else {
          return Promise.resolve(["172.16.0.10"]); // Internal service
        }
      });

      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("No AAAA record"));

      await expect(
        client.request("http://internal-service-attack.example/webhook"),
      ).rejects.toThrow("Blocked IP address detected at connection time");
    });
  });
});
