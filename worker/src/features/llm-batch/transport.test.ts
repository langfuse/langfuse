import { describe, expect, it } from "vitest";
import { z } from "zod";
import { encrypt } from "@langfuse/shared/encryption";
import {
  ChatMessageRole,
  ChatMessageType,
  generateLlmEvaluatorOutput,
  LLMAdapter,
} from "@langfuse/shared/src/server";
import {
  createCaptureTransport,
  createReplayTransport,
  ProviderRequestCapturedSignal,
} from "./transport";

const outputResultSchema = z.object({
  reasoning: z.string().describe("why this score was given"),
  score: z.number().describe("score between 0 and 1"),
});

// The Gemini API and Vertex AI share the GenerateContent request and response
// shapes; the Gemini API adapter needs no OAuth round trip, so the real AI SDK
// call runs fully offline here.
const callEvaluator = (transport: typeof fetch) =>
  generateLlmEvaluatorOutput({
    projectId: "project-123",
    connection: { secretKey: encrypt("test-key") },
    modelParams: {
      provider: "google",
      model: "gemini-4-argon",
      adapter: LLMAdapter.GoogleAIStudio,
    },
    messages: [
      {
        role: ChatMessageRole.User,
        type: ChatMessageType.User,
        content: "Judge this answer: 42",
      },
    ],
    outputResultSchema,
    transport,
  });

describe("batch transports with the real AI SDK", () => {
  it("captures the generateContent request without sending it", async () => {
    const { transport, getCaptured } = createCaptureTransport();

    await expect(callEvaluator(transport)).rejects.toBeDefined();

    const captured = getCaptured();
    expect(captured?.url).toMatch(/models\/gemini-4-argon:generateContent$/);
    expect(captured?.body).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "Judge this answer: 42" }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
  });

  it("parses a replayed batch response into the evaluator output", async () => {
    const response = {
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                text: JSON.stringify({
                  scoreExplanation: "Correct answer",
                  score: 0.9,
                }),
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 12,
        candidatesTokenCount: 8,
        totalTokenCount: 20,
      },
      modelVersion: "gemini-4-argon",
    };

    const result = await callEvaluator(createReplayTransport(response));

    expect(result.output).toEqual({ score: 0.9, reasoning: "Correct answer" });
    expect(result.usage).toMatchObject({ inputTokens: 12, outputTokens: 8 });
  });

  it("refuses a second request on either transport", async () => {
    const { transport } = createCaptureTransport();
    await expect(transport("https://x", { body: "{}" })).rejects.toBeInstanceOf(
      ProviderRequestCapturedSignal,
    );
    await expect(transport("https://x", { body: "{}" })).rejects.toThrow(
      "second request",
    );

    const replay = createReplayTransport({});
    await replay("https://x");
    await expect(replay("https://x")).rejects.toThrow("second request");
  });
});
