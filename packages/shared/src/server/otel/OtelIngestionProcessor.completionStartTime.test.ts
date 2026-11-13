import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";
import { stringDateTime } from "../../../domain";

describe("OtelIngestionProcessor completionStartTime", () => {
  it("normalizes double-stringified timestamp attribute from older SDKs", () => {
    const rawDoubleQuoted = '"2025-10-01T08:45:26.112648Z"';
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: { name: "ai", version: "7.0.0" },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "chat gpt-5.5",
                kind: 3,
                startTimeUnixNano: "1752384000000000000",
                endTimeUnixNano: "1752384001000000000",
                attributes: [
                  {
                    key: "gen_ai.operation.name",
                    value: { stringValue: "chat" },
                  },
                  {
                    key: "langfuse.observation.completion_start_time",
                    value: { stringValue: rawDoubleQuoted },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      },
    ];

    const events = new OtelIngestionProcessor({
      projectId: "project-1",
      publicKey: "pk-test",
      sdkName: "ai",
      sdkVersion: "7.0.0",
    }).processToEvent(batch);

    expect(events).toHaveLength(1);
    expect((events[0] as any).completionStartTime).toBe(
      "2025-10-01T08:45:26.112Z",
    );
    expect(
      stringDateTime.safeParse((events[0] as any).completionStartTime).success,
    ).toBe(true);
  });

  it("normalizes high-precision plain ISO string timestamp attribute", () => {
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: { name: "ai", version: "7.0.0" },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "chat gpt-5.5",
                kind: 3,
                startTimeUnixNano: "1752384000000000000",
                endTimeUnixNano: "1752384001000000000",
                attributes: [
                  {
                    key: "gen_ai.operation.name",
                    value: { stringValue: "chat" },
                  },
                  {
                    key: "langfuse.observation.completion_start_time",
                    value: { stringValue: "2025-10-01T08:45:26.112648Z" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      },
    ];

    const events = new OtelIngestionProcessor({
      projectId: "project-1",
      publicKey: "pk-test",
      sdkName: "ai",
      sdkVersion: "7.0.0",
    }).processToEvent(batch);

    expect(events).toHaveLength(1);
    expect((events[0] as any).completionStartTime).toBe(
      "2025-10-01T08:45:26.112Z",
    );
    expect(
      stringDateTime.safeParse((events[0] as any).completionStartTime).success,
    ).toBe(true);
  });
});
