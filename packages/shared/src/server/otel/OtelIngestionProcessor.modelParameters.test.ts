import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

describe("OtelIngestionProcessor model parameters", () => {
  it("retains the service tier from Vercel AI SDK spans", () => {
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
                    key: "gen_ai.request.model",
                    value: { stringValue: "gpt-5.5" },
                  },
                  {
                    key: "gen_ai.request.service_tier",
                    value: { stringValue: "priority" },
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
    expect(events[0].modelParameters).toMatchObject({
      service_tier: "priority",
    });
  });
});
