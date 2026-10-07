import { describe, expect, it } from "vitest";
import { z } from "zod";
import { classifyJobFailure } from "../jobFailureReason";

const wrapStorage = (cause: unknown) =>
  new Error("Failed to download file from S3", { cause });

const zodError = () => {
  const result = z.object({ id: z.string() }).safeParse({ id: 1 });
  if (result.success) throw new Error("expected zod failure");
  return result.error;
};

const jsonSyntaxError = () => {
  try {
    JSON.parse("{not json");
  } catch (e) {
    return e;
  }
  throw new Error("expected JSON.parse failure");
};

describe("classifyJobFailure", () => {
  it.each([
    [
      "wrapped S3 SlowDown",
      wrapStorage(
        Object.assign(new Error("Please reduce your request rate."), {
          name: "SlowDown",
          Code: "SlowDown",
          $metadata: { httpStatusCode: 503 },
        }),
      ),
      "s3_slowdown",
    ],
    [
      "wrapped S3 socket reset",
      wrapStorage(
        Object.assign(new Error("socket hang up"), {
          name: "TimeoutError",
          code: "ECONNRESET",
        }),
      ),
      "network",
    ],
    [
      "multi-address connect failure",
      wrapStorage(
        new AggregateError([
          Object.assign(new Error("connect ECONNREFUSED ::1:9000"), {
            code: "ECONNREFUSED",
          }),
          Object.assign(new Error("connect ETIMEDOUT 127.0.0.1:9000"), {
            code: "ETIMEDOUT",
          }),
        ]),
      ),
      "network",
    ],
    [
      "storage DNS failure",
      Object.assign(
        new Error(
          "Storage service temporarily unavailable due to network issues",
        ),
        {
          cause: Object.assign(new Error("getaddrinfo"), { code: "EAI_AGAIN" }),
        },
      ),
      "network",
    ],
    [
      "Postgres NUL byte",
      new Error(
        'Invalid `prisma.$executeRaw()` invocation:\n\nRaw query failed. Code: `22021`. Message: `ERROR: invalid byte sequence for encoding "UTF8": 0x00`',
      ),
      "invalid_data",
    ],
    ["JSON.parse failure", jsonSyntaxError(), "invalid_data"],
    ["zod validation failure", zodError(), "invalid_data"],
    [
      "ClickHouse oversized JSON row",
      new Error(
        "Size of JSON object at position 104857600 is extremely large. Expected not greater than 10485760 bytes, but current is 104857605 bytes per row.",
      ),
      "payload_too_large",
    ],
    [
      "JS string length limit",
      new RangeError("Invalid string length"),
      "payload_too_large",
    ],
    [
      "Node max string size",
      Object.assign(
        new Error("Cannot create a string longer than 0x1fffffe8 characters"),
        { code: "ERR_STRING_TOO_LONG" },
      ),
      "payload_too_large",
    ],
    [
      "BullMQ stall limit",
      new Error("job stalled more than allowable limit"),
      "stalled",
    ],
    ["unknown error", new Error("Redis not available"), "other"],
    ["non-error value", "boom", "other"],
  ])("%s → %s", (_label, error, expected) => {
    expect(classifyJobFailure(error)).toBe(expected);
  });
});
