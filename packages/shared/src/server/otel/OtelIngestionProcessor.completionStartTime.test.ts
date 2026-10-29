/**
 * `completionStartTime` extraction from OTel span attributes.
 *
 * The attribute is absent on most spans, so the shape of that case matters as
 * much as the shapes that carry a value: it must return null without reaching
 * a parse. The cases below pin all four inputs the extractor accepts.
 */
import { describe, it, expect } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

type OtelAttribute = { key: string; value: Record<string, unknown> };

const START_UNIX_NANO = "1752384000000000000"; // 2025-07-13T05:20:00.000Z
const END_UNIX_NANO = "1752384002000000000";

const buildBatch = (attributes: OtelAttribute[]): ResourceSpan[] => [
  {
    resource: {
      attributes: [{ key: "service.name", value: { stringValue: "test-svc" } }],
    },
    scopeSpans: [
      {
        scope: { name: "langfuse-sdk", version: "3.8.1" },
        spans: [
          {
            traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
            spanId: Buffer.from("0123456789abcdef", "hex"),
            name: "test-span",
            kind: 1,
            startTimeUnixNano: START_UNIX_NANO,
            endTimeUnixNano: END_UNIX_NANO,
            attributes: [
              {
                key: "langfuse.observation.type",
                value: { stringValue: "generation" },
              },
              ...attributes,
            ],
            status: {},
          },
        ],
      },
    ],
  },
];

const completionStartTimeOf = (attributes: OtelAttribute[]) => {
  const processor = new OtelIngestionProcessor({
    projectId: "test-project",
    publicKey: "pk-test",
    sdkName: "python",
    sdkVersion: "3.8.1",
  });
  const events = processor.processToEvent(buildBatch(attributes));

  expect(events).toHaveLength(1);
  return events[0].completionStartTime ?? null;
};

describe("completionStartTime", () => {
  it("is null when the span does not carry the attribute", () => {
    expect(completionStartTimeOf([])).toBeNull();
  });

  it("is taken from a plain ISO string", () => {
    expect(
      completionStartTimeOf([
        {
          key: "langfuse.observation.completion_start_time",
          value: { stringValue: "2025-07-13T05:20:00.500Z" },
        },
      ]),
    ).toBe("2025-07-13T05:20:00.500Z");
  });

  it("is unwrapped from the double stringified form older SDKs send", () => {
    expect(
      completionStartTimeOf([
        {
          key: "langfuse.observation.completion_start_time",
          value: {
            stringValue: JSON.stringify("2025-07-13T05:20:00.500Z"),
          },
        },
      ]),
    ).toBe("2025-07-13T05:20:00.500Z");
  });

  it("is derived from the Vercel AI SDK's msToFirstChunk", () => {
    expect(
      completionStartTimeOf([
        { key: "ai.response.msToFirstChunk", value: { intValue: 500 } },
      ]),
    ).toBe("2025-07-13T05:20:00.500Z");
  });
});
