import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse, delay } from "msw";
import type { SharedEnv } from "@langfuse/shared/src/env";
import { prepareOtelBatch } from "../features/otel-ingestion/prepareOtelBatch";
import * as masking from "@langfuse/shared/src/server/ee/ingestionMasking";
import {
  applyIngestionMasking,
  isIngestionMaskingEnabled,
} from "@langfuse/shared/src/server/ee/ingestionMasking";

const telemetryMocks = vi.hoisted(() => ({
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    recordDistribution: telemetryMocks.recordDistribution,
    recordIncrement: telemetryMocks.recordIncrement,
  };
});

vi.mock(
  "@langfuse/shared/src/server/ee/ingestionMasking",
  async (importOriginal) => {
    const actual = await importOriginal<typeof masking>();
    return {
      ...actual,
      applyIngestionMasking: vi.fn(actual.applyIngestionMasking),
    };
  },
);

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

function expectPreparationMetrics(
  outcome: "native" | "masking_drop" | "error",
  extractMedia: boolean,
) {
  const tags = { outcome, extract_media: extractMedia.toString() };
  const preparationIncrements =
    telemetryMocks.recordIncrement.mock.calls.filter(
      ([name]) => name === "langfuse.ingestion.otel.early_media.preparation",
    );
  expect(preparationIncrements).toHaveLength(1);
  expect(preparationIncrements[0]).toEqual([
    "langfuse.ingestion.otel.early_media.preparation",
    1,
    tags,
  ]);
  const preparationDurations =
    telemetryMocks.recordDistribution.mock.calls.filter(
      ([name]) =>
        name === "langfuse.ingestion.otel.early_media.preparation_duration_ms",
    );
  expect(preparationDurations).toHaveLength(1);
  expect(preparationDurations[0]).toEqual([
    "langfuse.ingestion.otel.early_media.preparation_duration_ms",
    expect.any(Number),
    tags,
  ]);
}

describe("Ingestion Masking", () => {
  beforeAll(() => {
    maskingServer.setup();
  });

  beforeEach(() => {
    maskingServer.reset();
    telemetryMocks.recordDistribution.mockReset();
    telemetryMocks.recordIncrement.mockReset();
  });

  afterEach(() => {
    maskingServer.reset();
    telemetryMocks.recordDistribution.mockReset();
    telemetryMocks.recordIncrement.mockReset();
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
    it.each(["success", "fail-open", "fail-closed"] as const)(
      "compacts only the accepted raw masking input (%s)",
      async (outcome) => {
        const original = { input: "data:image/png;base64,b3JpZ2luYWw=" };
        const masked = { input: "data:image/png;base64,bWFza2Vk" };
        const overrides = createTestEnv({
          LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
            "https://masking.example.com/raw",
          LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
          LANGFUSE_INGESTION_MASKING_MAX_RETRIES: 0,
          LANGFUSE_INGESTION_MASKING_CALLBACK_FAIL_CLOSED:
            outcome === "fail-closed" ? "true" : "false",
        });
        const configuredMasking = vi.mocked(masking.applyIngestionMasking);
        const applyMasking = configuredMasking.getMockImplementation()!;
        configuredMasking.mockImplementation((params, _env, transport) =>
          applyMasking(params, overrides, transport),
        );
        const fetch = vi
          .spyOn(globalThis, "fetch")
          .mockResolvedValueOnce(
            new Response(outcome === "success" ? JSON.stringify(masked) : "{"),
          );
        let prepared: Awaited<ReturnType<typeof prepareOtelBatch>> | undefined;
        try {
          prepared = await prepareOtelBatch({
            bytes: Buffer.from(JSON.stringify(original)),
            projectId: "test-project",
            extractMedia: true,
          });
          // Masking sees the original inline content, before reference substitution.
          const body = fetch.mock.calls[0]?.[1]?.body;
          expect(body).toBeInstanceOf(Uint8Array);
          expect(
            JSON.parse(Buffer.from(body as Uint8Array).toString()),
          ).toEqual(original);
          if (outcome === "fail-closed") {
            expect(prepared).toEqual({ error: expect.any(String) });
            expectPreparationMetrics("masking_drop", true);
            return;
          }
          const batch = prepared?.batch;
          expect(batch).toBeDefined();
          expect(batch!.media).toHaveLength(1);
          expect((await batch!.mediaBody(0)).toString()).toBe(
            outcome === "success" ? "masked" : "original",
          );
          expect(JSON.parse(batch!.json()).input).toBe(
            batch!.media[0].reference,
          );
          expectPreparationMetrics("native", true);
        } finally {
          await prepared?.batch?.dispose();
          fetch.mockRestore();
          configuredMasking.mockImplementation(applyMasking);
        }
      },
    );

    it.each(["request", "response"] as const)(
      "sanitizes invalid UTF-8 in the masking %s before media discovery",
      async (side) => {
        const malformed = Buffer.concat([
          Buffer.from('[{"note":"'),
          Buffer.from([0xff, 0xe2, 0x82]),
          Buffer.from('","input":"data:image/png;base64,aGk="}]'),
        ]);
        const sanitized = Buffer.from(malformed.toString("utf8"));
        const originalBytes = side === "request" ? malformed : sanitized;
        const responseBytes = side === "response" ? malformed : sanitized;
        const overrides = createTestEnv({
          LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
            "https://masking.example.com/raw",
          LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
          LANGFUSE_INGESTION_MASKING_MAX_RETRIES: 0,
        });
        const configuredMasking = vi.mocked(masking.applyIngestionMasking);
        const applyMasking = configuredMasking.getMockImplementation()!;
        configuredMasking.mockImplementation((params, _env, transport) =>
          applyMasking(params, overrides, transport),
        );
        const fetch = vi
          .spyOn(globalThis, "fetch")
          .mockResolvedValueOnce(new Response(new Uint8Array(responseBytes)));
        let prepared: Awaited<ReturnType<typeof prepareOtelBatch>> | undefined;
        try {
          prepared = await prepareOtelBatch({
            bytes: originalBytes,
            projectId: "test-project",
            extractMedia: true,
          });
          const body = fetch.mock.calls[0]?.[1]?.body;
          expect(body).toBeInstanceOf(Uint8Array);
          expect(Buffer.from(body as Uint8Array)).toEqual(sanitized);
          expect(fetch).toHaveBeenCalledTimes(1);
          const batch = prepared.batch!;
          expect(JSON.parse(batch.json())[0].note).toBe("��");
          expect(batch.media).toHaveLength(1);
          expect((await batch.mediaBody(0)).toString()).toBe("hi");
          expectPreparationMetrics("native", true);
        } finally {
          await prepared?.batch?.dispose();
          fetch.mockRestore();
          configuredMasking.mockImplementation(applyMasking);
        }
      },
    );

    it.each([
      ["native", Buffer.from('[{"input":"\\ud800"}]')],
      ["error", Buffer.from("{")],
    ] as const)(
      "records the %s preparation outcome",
      async (outcome, bytes) => {
        const preparation = prepareOtelBatch({
          bytes,
          projectId: "test-project",
          extractMedia: false,
        });

        if (outcome === "error") {
          await expect(preparation).rejects.toThrow();
        } else {
          const prepared = await preparation;
          try {
            expect(JSON.parse(prepared.batch!.json())).toEqual([
              { input: "\ud800" },
            ]);
          } finally {
            await prepared.batch?.dispose();
          }
        }
        expectPreparationMetrics(outcome, false);
      },
    );

    it.each(["retry-success", "fail-open", "fail-closed"] as const)(
      "validates raw masking responses inside retries (%s)",
      async (outcome) => {
        const data = Buffer.from(JSON.stringify(sampleSpanData));
        const testEnv = createTestEnv({
          LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
            "https://masking.example.com/success",
          LANGFUSE_EE_LICENSE_KEY: VALID_EE_LICENSE_KEY,
          LANGFUSE_INGESTION_MASKING_MAX_RETRIES: 1,
          LANGFUSE_INGESTION_MASKING_CALLBACK_FAIL_CLOSED:
            outcome === "fail-closed" ? "true" : "false",
        });
        let validations = 0;
        const result = await applyIngestionMasking(
          { data, projectId: "test-project" },
          testEnv,
          {
            body: (bytes) => new Uint8Array(bytes),
            read: async (response) => {
              const bytes = Buffer.from(await response.arrayBuffer());
              validations++;
              if (outcome !== "retry-success" || validations === 1) {
                throw new Error("invalid masked JSON");
              }
              return bytes;
            },
          },
        );
        expect(validations).toBe(2);
        expect(maskingServer.getReceivedRequests()).toHaveLength(2);
        for (const request of maskingServer.getReceivedRequests()) {
          expect(request.headers["content-type"]).toBe("application/json");
          expect(request.body).toEqual(sampleSpanData);
        }
        expect(result.success).toBe(outcome !== "fail-closed");
        expect(result.masked).toBe(outcome === "retry-success");
        if (outcome === "retry-success") {
          expect(JSON.parse(result.data.toString())).toEqual(maskedSpanData);
        } else {
          expect(result.data).toBe(data);
          if (outcome === "fail-closed") {
            expect(result.error).toContain("invalid masked JSON");
          }
        }
      },
    );

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
