import { describe, expect, it, vi } from "vitest";
import { Writable } from "node:stream";
import winston from "winston";

vi.mock("../env", () => ({
  env: {
    LANGFUSE_LOG_FORMAT: "json",
    LANGFUSE_LOG_LEVEL: "info",
    NODE_ENV: "test",
  },
}));

const getCurrentSpan = vi.hoisted(() => vi.fn());
vi.mock("./instrumentation", () => ({ getCurrentSpan }));

import { logger } from "./logger";
import { withCustomerDataLoggingSuppressed } from "./loggingContext";

const jsonLine = (meta: Record<string, unknown>) => {
  const info = logger.format.transform({
    level: "error",
    message: "job failed",
    ...meta,
  });
  if (typeof info === "boolean") throw new Error("log line was filtered");
  return JSON.parse(info[Symbol.for("message")] as string);
};

describe("logger JSON format", () => {
  it("serialises a nested error and its cause chain", () => {
    const rootCause = new Error("socket hang up");
    const cause = Object.assign(
      new Error("Connection timed out", { cause: rootCause }),
      { name: "TimeoutError" },
    );
    const error = new Error("Failed to download file from S3", { cause });

    expect(jsonLine({ error, projectId: "project-1" })).toMatchObject({
      error: {
        message: "Failed to download file from S3",
        stack: error.stack,
        cause: {
          name: "TimeoutError",
          message: "Connection timed out",
          cause: { message: "socket hang up" },
        },
      },
      projectId: "project-1",
    });
  });

  it("serialises the same error in full on every line", () => {
    const error = new Error("NoSuchKey");

    jsonLine({ error });
    expect(jsonLine({ error })).toMatchObject({
      error: { message: "NoSuchKey" },
    });
  });

  it("keeps aggregated errors and survives a cyclic cause chain", () => {
    const error = new AggregateError([new Error("part failed")], "batch");
    error.cause = error;

    expect(jsonLine({ error })).toMatchObject({
      error: {
        message: "batch",
        cause: "[Circular]",
        errors: [{ message: "part failed" }],
      },
    });
  });

  it("suppresses customer data at the real child logger sink only in scope", async () => {
    const output: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output.push(String(chunk));
        callback();
      },
    });
    const transport = new winston.transports.Stream({ stream });
    const existingTransports = [...logger.transports];

    logger.clear();
    logger.add(transport);

    try {
      const childLogger = logger.child({ format: "native-test" });
      childLogger.error("synthetic-customer-value", {
        error: new Error("synthetic-customer-error"),
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(output.join("")).toContain("synthetic-customer-value");
      expect(output.join("")).toContain("synthetic-customer-error");

      output.length = 0;
      await withCustomerDataLoggingSuppressed(async () => {
        await Promise.resolve();
        childLogger.error("suppressed-customer-value", {
          error: new Error("suppressed-customer-error"),
        });
        await new Promise<void>((resolve) => setImmediate(resolve));
      });
      expect(output).toHaveLength(0);

      logger.cork();
      let writeCallbackCalled = false;
      await withCustomerDataLoggingSuppressed(() => {
        const accepted = logger.write(
          { level: "warn", message: "corked-suppressed-customer-value" },
          () => {
            writeCallbackCalled = true;
          },
        );
        expect(accepted).toBe(true);
        childLogger.warn("corked-suppressed-customer-value");
      });
      logger.uncork();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(output).toHaveLength(0);
      expect(writeCallbackCalled).toBe(true);

      childLogger.error("post-scope-customer-value");
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(output.join("")).toContain("post-scope-customer-value");
    } finally {
      logger.clear();
      for (const existingTransport of existingTransports) {
        logger.add(existingTransport);
      }
      stream.destroy();
    }
  });
});

describe("logger trace correlation", () => {
  it("nests the Datadog ids under dd and keeps the hex OTel ids", () => {
    getCurrentSpan.mockReturnValueOnce({
      spanContext: () => ({
        traceId: "617222771252365135e4848d739614a8",
        spanId: "00f067aa0ba902b7",
      }),
    });

    const line = jsonLine({});

    expect(line.dd).toEqual({
      trace_id: "3883374521764680872",
      span_id: "67667974448284343",
    });
    expect(line).not.toHaveProperty(["dd.trace_id"]);
    expect(line).not.toHaveProperty(["dd.span_id"]);
    expect(line.trace_id).toBe("617222771252365135e4848d739614a8");
    expect(line.span_id).toBe("00f067aa0ba902b7");
  });
});
