import { describe, expect, it, vi } from "vitest";
import { createTypeSafeDecisionModelClient } from "./typeSafeDecisionModelClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createTypeSafeDecisionModelClient", () => {
  it("posts one choice question with the state and reads confidence back", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: "jev-1.13.0",
        answers: {
          verdict: {
            type: "choice",
            choice: "ready",
            confidence: 0.82,
            probabilities: { ready: 0.91, needs_revision: 0.09 },
          },
        },
        usage: { input_tokens: 200, output_tokens: 3 },
      }),
    );

    const client = createTypeSafeDecisionModelClient({
      apiKey: "sk-test",
      model: "jev-latest",
      fetchImpl,
    });
    const evaluation = await client.evaluateChoice({
      state: { input: "Can I get a refund?", output: "Yes." },
      question: {
        type: "choice",
        instructions: "Is this reply ready to send?",
        criteria: { ready: null, needs_revision: null },
      },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer sk-test",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      model: "jev-latest",
      state: { input: "Can I get a refund?", output: "Yes." },
      questions: {
        verdict: {
          type: "choice",
          instructions: "Is this reply ready to send?",
          criteria: { ready: null, needs_revision: null },
        },
      },
    });

    expect(evaluation).toEqual({
      model: "jev-1.13.0",
      answer: {
        type: "choice",
        choice: "ready",
        probabilities: { ready: 0.91, needs_revision: 0.09 },
        confidence: 0.82,
      },
      usage: { inputTokens: 200, outputTokens: 3 },
    });
  });

  it("surfaces API failures as AI SDK call errors with the status code", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: "invalid api key" }, 401));

    const client = createTypeSafeDecisionModelClient({
      apiKey: "sk-bad",
      model: "jev-latest",
      fetchImpl,
    });

    await expect(
      client.evaluateChoice({
        state: { output: "x" },
        question: {
          type: "choice",
          instructions: "q",
          criteria: { a: null, b: null },
        },
      }),
    ).rejects.toMatchObject({
      name: "AI_APICallError",
      statusCode: 401,
      isRetryable: false,
    });
  });
});
