import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

const extractOpenInferenceUsage = (tokenCounts: Record<string, number>) => {
  const batch: ResourceSpan[] = [
    {
      scopeSpans: [
        {
          scope: { name: "openinference.instrumentation.openai" },
          spans: [
            {
              traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
              spanId: Buffer.from("0123456789abcdef", "hex"),
              name: "ChatCompletion",
              kind: 1,
              attributes: Object.entries(tokenCounts).map(([name, count]) => ({
                key: `llm.token_count.${name}`,
                value: { intValue: count },
              })),
            },
          ],
        },
      ],
    },
  ];

  const [event] = new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "pk-test",
    sdkName: "opentelemetry",
    sdkVersion: "1.31.0",
  }).processToEvent(batch);
  return event.providedUsageDetails;
};

describe("OtelIngestionProcessor OpenInference prompt_details.audio", () => {
  it("moves audio out of input into input_audio_tokens and keeps total", () => {
    expect(
      extractOpenInferenceUsage({
        prompt: 1000,
        "prompt_details.audio": 200,
        completion: 50,
        total: 1050,
      }),
    ).toEqual({ input: 800, input_audio_tokens: 200, output: 50, total: 1050 });
  });

  it("maps a zero audio count to input_audio_tokens 0", () => {
    expect(
      extractOpenInferenceUsage({ prompt: 1000, "prompt_details.audio": 0 }),
    ).toEqual({ input: 1000, input_audio_tokens: 0 });
  });

  it("floors input at 0 when audio exceeds the prompt count", () => {
    expect(
      extractOpenInferenceUsage({ prompt: 100, "prompt_details.audio": 150 }),
    ).toEqual({ input: 0, input_audio_tokens: 150 });
  });
});
