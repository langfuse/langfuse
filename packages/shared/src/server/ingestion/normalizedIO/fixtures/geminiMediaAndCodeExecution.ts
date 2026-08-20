import type { NormalizedIOFixture } from "./types";

/**
 * Raw Gemini/Vertex wire shapes: keyed parts without a `type` discriminator
 * (bare text, inline_data, file_data), thought parts with thoughtSignature,
 * provider-executed code execution (executable_code / code_execution_result),
 * and the candidate-level finishReason.
 */
export const geminiMediaAndCodeExecutionFixture = {
  name: "normalizes Gemini media parts and code execution",
  spanIO: {
    input: {
      contents: [
        {
          role: "user",
          parts: [
            { text: "Analyze this chart and compute the sum." },
            { inline_data: { mime_type: "image/png", data: "aVZCT1J3" } },
            {
              file_data: {
                mime_type: "application/pdf",
                file_uri: "gs://bucket/report.pdf",
              },
            },
          ],
        },
      ],
    },
    output: {
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                text: "Let me run the numbers.",
                thought: true,
                thoughtSignature: "sig_gemini_1",
              },
              {
                executable_code: { language: "PYTHON", code: "print(1 + 2)" },
              },
              {
                code_execution_result: { outcome: "OUTCOME_OK", output: "3" },
              },
              { text: "The sum is 3." },
            ],
          },
          finishReason: "STOP",
        },
      ],
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [
          { type: "text", text: "Analyze this chart and compute the sum." },
          {
            type: "file",
            mediaType: "image/png",
            content: { kind: "base64", data: "aVZCT1J3" },
          },
          {
            type: "file",
            mediaType: "application/pdf",
            content: { kind: "url", url: "gs://bucket/report.pdf" },
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            content: {
              kind: "text",
              text: "Let me run the numbers.",
              signature: "sig_gemini_1",
            },
          },
          {
            type: "tool-call",
            toolCallId: null,
            toolName: "code_execution",
            input: { language: "PYTHON", code: "print(1 + 2)" },
            toolType: "executable_code",
            providerExecuted: true,
          },
          {
            type: "tool-result",
            toolCallId: null,
            toolName: "code_execution",
            output: { outcome: "OUTCOME_OK", output: "3" },
          },
          { type: "text", text: "The sum is 3." },
        ],
        finishReason: { type: "stop", raw: "STOP" },
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;
