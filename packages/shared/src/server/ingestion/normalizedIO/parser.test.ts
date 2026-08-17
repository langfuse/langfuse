import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "../../otel/OtelIngestionProcessor";
import {
  normalizedSubmitFeedback,
  submitFeedbackOtelFixture,
} from "./fixtures/submitFeedback";
import { normalizeIO } from "./parser";

describe("normalized observation I/O", () => {
  it("runs the OTel event output through the normalizer", () => {
    const events = new OtelIngestionProcessor({
      projectId: "normalized-io-test-project",
      publicKey: "pk-test",
      sdkName: "otel",
      sdkVersion: "1.0.0",
    }).processToEvent(submitFeedbackOtelFixture as unknown as ResourceSpan[]);

    const event = events[0];
    expect(event).toBeDefined();

    const normalizedIO = normalizeIO(event);
    expect(normalizedIO).toEqual(normalizedSubmitFeedback);
  });

  it("combines tool definitions from independent input and metadata keys", () => {
    const normalizedIO = normalizeIO({
      input: {
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "What is the weather?" }],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              parameters: { type: "object" },
            },
          },
        ],
      },
      output: {
        messages: [
          {
            role: "assistant",
            parts: [
              {
                type: "tool_call",
                id: "call-1",
                name: "get_weather",
                arguments: { city: "Berlin" },
              },
            ],
          },
        ],
      },
      metadata: {
        tools: [
          {
            name: "search_docs",
            inputSchema: { type: "object" },
          },
        ],
        attributes: {
          "gen_ai.tool.definitions": JSON.stringify([
            {
              name: "get_weather",
              description: "Get the current weather",
              providerMetadata: { source: "otel" },
            },
            {
              name: "send_email",
              parameters: JSON.stringify({ type: "object" }),
            },
          ]),
        },
      },
    });

    expect(normalizedIO).toEqual({
      messages: [
        {
          role: "user",
          parts: [{ type: "text", text: "What is the weather?" }],
          source: "input",
        },
        {
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "get_weather",
              input: { city: "Berlin" },
            },
          ],
          source: "output",
        },
      ],
      toolDefinitions: [
        {
          name: "get_weather",
          description: "Get the current weather",
          inputSchema: { type: "object" },
          type: "function",
          providerMetadata: { source: "otel" },
        },
        {
          name: "search_docs",
          inputSchema: { type: "object" },
        },
        {
          name: "send_email",
          inputSchema: { type: "object" },
        },
      ],
    });
  });
});
