import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse, delay } from "msw";
import type { SharedEnv } from "@langfuse/shared/src/env";
import {
  applyIngestionMasking,
  isIngestionMaskingEnabled,
} from "@langfuse/shared/src/server/ee/ingestionMasking";

// Sample OTEL span data for testing
const sampleSpanData = [
  {
    resource: {
      attributes: [
        { key: "service.name", value: { stringValue: "test-service" } },
      ],
    },
    scopeSpans: [
      {
        scope: { name: "test-scope" },
        spans: [
          {
            traceId: "abc123",
            spanId: "def456",
            name: "test-span",
            attributes: [
              { key: "sensitive.data", value: { stringValue: "secret-value" } },
            ],
          },
        ],
      },
    ],
  },
];

// Masked version of the sample data
const maskedSpanData = [
  {
    resource: {
      attributes: [
        { key: "service.name", value: { stringValue: "test-service" } },
      ],
    },
    scopeSpans: [
      {
        scope: { name: "test-scope" },
        spans: [
          {
            traceId: "abc123",
            spanId: "def456",
            name: "test-span",
            attributes: [
              {
                key: "sensitive.data",
                value: { stringValue: "***REDACTED***" },
              },
            ],
          },
        ],
      },
    ],
  },
];

// Mock webhook server for testing HTTP requests
class MaskingCallbackTestServer {
  private server;
  private receivedRequests: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
  }> = [];

  constructor() {
    this.server = setupServer(
      // Success endpoint - returns masked data
      http.post("https://masking.example.com/success", async ({ request }) => {
        this.receivedRequests.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: await request.json(),
        });
        return HttpResponse.json(maskedSpanData, { status: 200 });
      }),

      // Echo endpoint - returns the same data it receives
      http.post("https://masking.example.com/echo", async ({ request }) => {
        const body = await request.json();
        this.receivedRequests.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body,
        });
        return HttpResponse.json(body, { status: 200 });
      }),

      // Error endpoint - returns 500
      http.post("https://masking.example.com/error", async ({ request }) => {
        this.receivedRequests.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: await request.json(),
        });
        return HttpResponse.json(
          { error: "Internal Server Error" },
          { status: 500 },
        );
      }),

      // Timeout endpoint - delays response
      http.post("https://masking.example.com/timeout", async ({ request }) => {
        this.receivedRequests.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: await request.json(),
        });
        // Delay longer than the timeout
        await delay(5000);
        return HttpResponse.json(maskedSpanData, { status: 200 });
      }),
    );
  }

  setup() {
    this.server.listen();
  }

  reset() {
    this.receivedRequests = [];
    this.server.resetHandlers();
  }

  teardown() {
    this.server.close();
  }

  getReceivedRequests() {
    return this.receivedRequests;
  }

  getLastRequest() {
    return this.receivedRequests[this.receivedRequests.length - 1];
  }
}

const maskingServer = new MaskingCallbackTestServer();

const VALID_EE_LICENSE_KEY = "langfuse_ee_test-license-key";

// Default test env with masking disabled
const defaultTestEnv: SharedEnv = {
  LANGFUSE_INGESTION_MASKING_CALLBACK_URL: undefined,
  LANGFUSE_INGESTION_MASKING_CALLBACK_TIMEOUT_MS: 500,
  LANGFUSE_INGESTION_MASKING_CALLBACK_FAIL_CLOSED: "false",
  LANGFUSE_INGESTION_MASKING_MAX_RETRIES: 1,
  LANGFUSE_INGESTION_MASKING_PROPAGATED_HEADERS: [],
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
  LANGFUSE_EE_LICENSE_KEY: undefined,
} as SharedEnv;

function createTestEnv(overrides: Partial<SharedEnv> = {}): SharedEnv {
  return { ...defaultTestEnv, ...overrides } as SharedEnv;
}

describe("Ingestion Masking", () => {
  beforeAll(() => {
    maskingServer.setup();
  });

  beforeEach(() => {
    maskingServer.reset();
  });

  afterEach(() => {
    maskingServer.reset();
  });

  afterAll(() => {
    maskingServer.teardown();
  });

  describe("isIngestionMaskingEnabled", () => {
    it("should return false when callback URL is not configured", () => {
      const testEnv = createTestEnv({
        LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
      });

      expect(isIngestionMaskingEnabled(testEnv)).toBe(false);
    });

    it("should return false when EE license is not available", () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/success",
      });

      expect(isIngestionMaskingEnabled(testEnv)).toBe(false);
    });

    it("should return true when callback URL and EE license are configured", () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/success",
        LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
      });

      expect(isIngestionMaskingEnabled(testEnv)).toBe(true);
    });

    it("should return true when callback URL is configured and running in cloud region", () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/success",
        NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "US",
      });

      expect(isIngestionMaskingEnabled(testEnv)).toBe(true);
    });
  });

  describe("applyIngestionMasking", () => {
    it("should return original data immediately when masking is not configured", async () => {
      const testEnv = createTestEnv();

      const result = await applyIngestionMasking(
        {
          data: sampleSpanData,
          projectId: "test-project",
          orgId: "test-org",
        },
        testEnv,
      );

      expect(result.success).toBe(true);
      expect(result.masked).toBe(false);
      expect(result.data).toEqual(sampleSpanData);

      // Verify no HTTP call was made
      expect(maskingServer.getReceivedRequests()).toHaveLength(0);
    });

    it("should return original data when EE license is not available", async () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/success",
      });

      const result = await applyIngestionMasking(
        {
          data: sampleSpanData,
          projectId: "test-project",
          orgId: "test-org",
        },
        testEnv,
      );

      expect(result.success).toBe(true);
      expect(result.masked).toBe(false);
      expect(result.data).toEqual(sampleSpanData);

      // Verify no HTTP call was made
      expect(maskingServer.getReceivedRequests()).toHaveLength(0);
    });

    it("should return masked data on successful callback", async () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/success",
        LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
      });

      const result = await applyIngestionMasking(
        {
          data: sampleSpanData,
          projectId: "test-project",
          orgId: "test-org",
        },
        testEnv,
      );

      expect(result.success).toBe(true);
      expect(result.masked).toBe(true);
      expect(result.data).toEqual(maskedSpanData);

      // Verify HTTP call was made
      const requests = maskingServer.getReceivedRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].body).toEqual(sampleSpanData);
    });

    it("should include X-Langfuse-Org-Id and X-Langfuse-Project-Id headers", async () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/success",
        LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
      });

      await applyIngestionMasking(
        {
          data: sampleSpanData,
          projectId: "test-project-123",
          orgId: "test-org-456",
        },
        testEnv,
      );

      const request = maskingServer.getLastRequest();
      expect(request?.headers["x-langfuse-org-id"]).toBe("test-org-456");
      expect(request?.headers["x-langfuse-project-id"]).toBe(
        "test-project-123",
      );
    });

    it("should propagate custom headers when configured", async () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/success",
        LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
      });

      await applyIngestionMasking(
        {
          data: sampleSpanData,
          projectId: "test-project",
          orgId: "test-org",
          propagatedHeaders: {
            "x-custom-header": "custom-value",
            "x-another-header": "another-value",
          },
        },
        testEnv,
      );

      const request = maskingServer.getLastRequest();
      expect(request?.headers["x-custom-header"]).toBe("custom-value");
      expect(request?.headers["x-another-header"]).toBe("another-value");
    });

    it("should return original data on HTTP 500 with fail-open (default)", async () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/error",
        LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
        LANGFUSE_INGESTION_MASKING_CALLBACK_FAIL_CLOSED: "false",
        LANGFUSE_INGESTION_MASKING_MAX_RETRIES: 0,
      });

      const result = await applyIngestionMasking(
        {
          data: sampleSpanData,
          projectId: "test-project",
          orgId: "test-org",
        },
        testEnv,
      );

      expect(result.success).toBe(true);
      expect(result.masked).toBe(false);
      expect(result.data).toEqual(sampleSpanData);
    });

    it("should return failure on HTTP 500 with fail-closed", async () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/error",
        LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
        LANGFUSE_INGESTION_MASKING_CALLBACK_FAIL_CLOSED: "true",
        LANGFUSE_INGESTION_MASKING_MAX_RETRIES: 0,
      });

      const result = await applyIngestionMasking(
        {
          data: sampleSpanData,
          projectId: "test-project",
          orgId: "test-org",
        },
        testEnv,
      );

      expect(result.success).toBe(false);
      expect(result.masked).toBe(false);
      expect(result.error).toContain("500");
    });

    it("should retry on failure", async () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/error",
        LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
        LANGFUSE_INGESTION_MASKING_CALLBACK_FAIL_CLOSED: "false",
        LANGFUSE_INGESTION_MASKING_MAX_RETRIES: 2,
      });

      await applyIngestionMasking(
        {
          data: sampleSpanData,
          projectId: "test-project",
          orgId: "test-org",
        },
        testEnv,
      );

      // Should have made 3 requests (1 initial + 2 retries)
      const requests = maskingServer.getReceivedRequests();
      expect(requests).toHaveLength(3);
    });

    it("should handle timeout with fail-open", async () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/timeout",
        LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
        LANGFUSE_INGESTION_MASKING_CALLBACK_TIMEOUT_MS: 100, // Short timeout
        LANGFUSE_INGESTION_MASKING_CALLBACK_FAIL_CLOSED: "false",
        LANGFUSE_INGESTION_MASKING_MAX_RETRIES: 0,
      });

      const result = await applyIngestionMasking(
        {
          data: sampleSpanData,
          projectId: "test-project",
          orgId: "test-org",
        },
        testEnv,
      );

      expect(result.success).toBe(true);
      expect(result.masked).toBe(false);
      expect(result.data).toEqual(sampleSpanData);
    }, 10000);

    it("should handle timeout with fail-closed", async () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/timeout",
        LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
        LANGFUSE_INGESTION_MASKING_CALLBACK_TIMEOUT_MS: 100, // Short timeout
        LANGFUSE_INGESTION_MASKING_CALLBACK_FAIL_CLOSED: "true",
        LANGFUSE_INGESTION_MASKING_MAX_RETRIES: 0,
      });

      const result = await applyIngestionMasking(
        {
          data: sampleSpanData,
          projectId: "test-project",
          orgId: "test-org",
        },
        testEnv,
      );

      expect(result.success).toBe(false);
      expect(result.masked).toBe(false);
      expect(result.error).toContain("timeout");
    }, 10000);

    it("should work with generic data types", async () => {
      const testEnv = createTestEnv({
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/echo",
        LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
      });

      const customData = { key: "value", nested: { data: [1, 2, 3] } };

      const result = await applyIngestionMasking(
        {
          data: customData,
          projectId: "test-project",
          orgId: "test-org",
        },
        testEnv,
      );

      expect(result.success).toBe(true);
      expect(result.masked).toBe(true);
      expect(result.data).toEqual(customData);
    });
  });
});
