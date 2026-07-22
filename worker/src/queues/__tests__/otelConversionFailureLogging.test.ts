/**
 * Tests that OTEL conversion failures log structured attribution context
 * (SDK name/version, instrumentation scopes, span count, project id, file key)
 * so a single Datadog log line answers which SDK produced a malformed batch
 * and how many spans were lost.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { logger, OtelIngestionProcessor } from "@langfuse/shared/src/server";

const FILE_KEY = "events/otel/test-project/2026/07/13/batch.json";

const createProcessor = () =>
  new OtelIngestionProcessor({
    projectId: "test-project",
    publicKey: "test-public-key",
    sdkName: "python",
    sdkVersion: "3.2.1",
    fileKey: FILE_KEY,
  });

const expectedContext = {
  projectId: "test-project",
  sdkName: "python",
  sdkVersion: "3.2.1",
  fileKey: FILE_KEY,
  spanCount: 1,
  instrumentationScopes: ["opentelemetry.instrumentation.openai"],
};

// Crash site: convertValueToPlainJavascript reads `value.stringValue` on undefined
const batchWithAttributeWithoutValue = [
  {
    scopeSpans: [
      {
        scope: { name: "opentelemetry.instrumentation.openai" },
        spans: [
          {
            traceId: "0123456789abcdef0123456789abcdef",
            spanId: "0123456789abcdef",
            name: "chat openai",
            attributes: [{ key: "gen_ai.system" }],
            startTimeUnixNano: "1752384000000000000",
            endTimeUnixNano: "1752384001000000000",
          },
        ],
      },
    ],
  },
];

// Crash site: parseId calls Buffer.from(undefined) when traceId is missing
const batchWithSpanWithoutTraceId = [
  {
    scopeSpans: [
      {
        scope: { name: "opentelemetry.instrumentation.openai" },
        spans: [
          {
            spanId: "0123456789abcdef",
            name: "chat openai",
            attributes: [],
            startTimeUnixNano: "1752384000000000000",
            endTimeUnixNano: "1752384001000000000",
          },
        ],
      },
    ],
  },
];

describe("OtelIngestionProcessor conversion failure logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs attribution context when processToIngestionEvents fails on an attribute without value", async () => {
    const errorSpy = vi.spyOn(logger, "error");

    const result = await createProcessor().processToIngestionEvents(
      batchWithAttributeWithoutValue,
    );

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      "Error processing OTEL spans:",
      expect.objectContaining({
        ...expectedContext,
        error: expect.any(Error),
      }),
    );
  });

  it("logs attribution context when processToIngestionEvents fails on a span without traceId", async () => {
    const errorSpy = vi.spyOn(logger, "error");

    const result = await createProcessor().processToIngestionEvents(
      batchWithSpanWithoutTraceId,
    );

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      "Error processing OTEL spans:",
      expect.objectContaining({
        ...expectedContext,
        error: expect.any(Error),
      }),
    );
  });

  it("logs attribution context when processToEvent fails on a span without traceId", () => {
    const errorSpy = vi.spyOn(logger, "error");

    expect(() =>
      createProcessor().processToEvent(batchWithSpanWithoutTraceId),
    ).toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      "Error processing OTEL spans to events:",
      expect.objectContaining({
        ...expectedContext,
        error: expect.any(Error),
      }),
    );
  });
});
