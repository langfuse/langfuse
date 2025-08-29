import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { SecureHttpClient } from "@langfuse/shared/src/server";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

describe("SecureHttpClient", () => {
  let server: ReturnType<typeof setupServer>;
  let client: SecureHttpClient;

  beforeAll(() => {
    client = new SecureHttpClient();

    // Mock server for testing legitimate requests
    server = setupServer(
      // Success endpoint - both POST and GET
      http.post("https://httpbin.org/post", () => {
        return HttpResponse.json(
          {
            success: true,
            data: "webhook received",
          },
          { status: 200 },
        );
      }),
      http.get("https://httpbin.org/post", () => {
        return HttpResponse.json(
          {
            success: true,
            data: "webhook received",
          },
          { status: 200 },
        );
      }),

      // Error endpoint for testing error handling
      http.post("https://httpbin.org/status/400", () => {
        return HttpResponse.json(
          {
            error: "Bad Request",
          },
          { status: 400 },
        );
      }),

      // Timeout endpoint for testing timeouts
      http.post("https://httpbin.org/delay/10", async () => {
        await new Promise((resolve) => setTimeout(resolve, 15000)); // 15s delay
        return HttpResponse.json({ delayed: true });
      }),

      // Another legitimate endpoint
      http.post("https://webhook.site/test", () => {
        return HttpResponse.text("OK", { status: 200 });
      }),
    );

    server.listen({ onUnhandledRequest: "bypass" });
  });

  afterAll(() => {
    server.close();
  });

  describe("request method", () => {
    it("should make successful HTTP requests", async () => {
      const response = await client.request("https://httpbin.org/post", {
        method: "POST",
        body: JSON.stringify({ test: "data" }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);
      expect(response.body).toContain("success");
    });

    it("should handle different HTTP methods", async () => {
      const response = await client.request("https://httpbin.org/post", {
        method: "POST",
        body: JSON.stringify({ method: "POST" }),
      });

      expect(response.status).toBe(200);
    });

    it("should handle custom headers", async () => {
      const response = await client.request("https://httpbin.org/post", {
        headers: {
          "X-Custom-Header": "test-value",
          Authorization: "Bearer token123",
        },
        body: JSON.stringify({ test: true }),
      });

      expect(response.status).toBe(200);
    });

    it("should handle non-200 status codes", async () => {
      const response = await client.request("https://httpbin.org/status/400", {
        body: JSON.stringify({ test: true }),
      });

      expect(response.status).toBe(400);
      expect(response.body).toContain("Bad Request");
    });

    it("should handle different response content types", async () => {
      const response = await client.request("https://webhook.site/test", {
        body: "plain text body",
      });

      expect(response.status).toBe(200);
      expect(response.body).toBe("OK");
    });
  });

  describe("security validations", () => {
    it("should block localhost URLs", async () => {
      await expect(client.request("http://localhost/webhook")).rejects.toThrow(
        "Blocked hostname detected",
      );
    });

    it("should block private IP addresses", async () => {
      await expect(
        client.request("http://192.168.1.1/webhook"),
      ).rejects.toThrow(/Blocked IP address detected|DNS lookup failed/);
    });

    it("should block cloud metadata endpoints", async () => {
      await expect(
        client.request("http://169.254.169.254/latest/meta-data/"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should block internal hostnames", async () => {
      await expect(
        client.request("http://internal.company.com/webhook"),
      ).rejects.toThrow(/Blocked hostname detected|DNS lookup failed/);
    });

    it("should block docker internal hostnames", async () => {
      await expect(
        client.request("http://host.docker.internal/webhook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should reject invalid protocols", async () => {
      await expect(client.request("ftp://example.com/file")).rejects.toThrow(
        "Only HTTP and HTTPS protocols are allowed",
      );
    });

    it("should reject disallowed ports", async () => {
      await expect(
        client.request("https://example.com:8080/webhook"),
      ).rejects.toThrow("Only ports 80 and 443 are allowed");
    });

    it("should handle URL encoding bypass attempts", async () => {
      await expect(
        client.request("http://%6C%6F%63%61%6C%68%6F%73%74/webhook"),
      ).rejects.toThrow("Blocked hostname detected");
    });
  });

  describe("timeout handling", () => {
    it("should respect custom timeout values", async () => {
      const startTime = Date.now();

      await expect(
        client.request("https://httpbin.org/delay/10", {
          timeout: 100, // Very short timeout
        }),
      ).rejects.toThrow(/timeout/i);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000); // Should timeout quickly
    }, 10000);

    it("should use default timeout when not specified", async () => {
      const startTime = Date.now();

      await expect(
        client.request("https://httpbin.org/delay/10"),
      ).rejects.toThrow(/timeout/i);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThan(4000); // Default 5s timeout
      expect(elapsed).toBeLessThan(7000);
    }, 10000);
  });

  describe("DNS rebinding protection", () => {
    it("should re-validate URLs at request time", async () => {
      // This tests that validation happens twice:
      // 1. During initial validation
      // 2. During the HTTP request (TOCTOU protection)

      await expect(client.request("http://localhost/webhook")).rejects.toThrow(
        "Blocked hostname detected",
      );
    });

    it("should block IPs discovered during DNS resolution", async () => {
      // Mock a scenario where DNS resolves to a blocked IP
      // This tests the connection-time validation in the custom lookup

      await expect(
        client.request("http://192.168.1.100/webhook"),
      ).rejects.toThrow(/Blocked IP address detected|DNS lookup failed/);
    });
  });

  describe("error handling", () => {
    it("should handle network errors gracefully", async () => {
      await expect(
        client.request(
          "https://definitely-does-not-exist-12345.invalid/webhook",
        ),
      ).rejects.toThrow(/DNS lookup failed|getaddrinfo ENOTFOUND/);
    });

    it("should handle malformed URLs", async () => {
      await expect(client.request("not-a-valid-url")).rejects.toThrow(
        "Invalid URL syntax",
      );
    });

    it("should handle empty or undefined URLs", async () => {
      await expect(client.request("")).rejects.toThrow();
    });
  });

  describe("request options", () => {
    it("should merge custom headers with defaults", async () => {
      const response = await client.request("https://httpbin.org/post", {
        headers: {
          "X-Custom": "value",
          "Content-Type": "application/xml", // Should override default
        },
        body: "<xml>test</xml>",
      });

      expect(response.status).toBe(200);
    });
  });
});
