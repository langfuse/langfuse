import { describe, expect, it, vi } from "vitest";
import type { DecisionModelRequest } from "../../evals/decisionModelEvaluatorExecution";
import { createTypeSafeDecisionModelClient } from "./typeSafeDecisionModelClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const request: DecisionModelRequest = {
  state: { question: "Can I get a refund?", reply: "Yes." },
  questions: {
    readiness: {
      type: "choice",
      instructions: "Is `reply` ready to send?",
      criteria: { ready: null, needs_revision: null },
    },
    frustration: {
      type: "score",
      instructions: "How frustrated is the customer?",
      criteria: ["Calm", "Frustrated", "Angry"],
    },
    refund: {
      type: "boolean",
      instructions: "Does `question` request a refund?",
    },
  },
};

describe("createTypeSafeDecisionModelClient", () => {
  it("posts all questions in one call and maps every answer type back", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: "jev-1.13.0",
        answers: {
          readiness: {
            type: "choice",
            choice: "ready",
            confidence: 0.82,
            probabilities: { ready: 0.91, needs_revision: 0.09 },
          },
          frustration: {
            type: "score",
            score: 1.26,
            confidence: 0.61,
            legend: { "0": "Calm", "1": "Frustrated", "2": "Angry" },
            probabilities: { "0": 0, "1": 0.74, "2": 0.26 },
          },
          refund: { type: "noul", noul: 0.97 },
        },
        usage: { input_tokens: 300, output_tokens: 9 },
      }),
    );

    const client = createTypeSafeDecisionModelClient({
      apiKey: "sk-test",
      model: "jev-latest",
      fetchImpl,
    });
    const evaluation = await client.evaluate(request);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer sk-test",
    );
    // The SDK sends TypeSafe's native `noul` type for boolean questions.
    expect(JSON.parse(init.body as string)).toEqual({
      model: "jev-latest",
      state: request.state,
      questions: {
        readiness: request.questions.readiness,
        frustration: request.questions.frustration,
        refund: { ...request.questions.refund, type: "noul" },
      },
    });

    expect(evaluation).toEqual({
      model: "jev-1.13.0",
      answers: {
        readiness: {
          type: "choice",
          choice: "ready",
          probabilities: { ready: 0.91, needs_revision: 0.09 },
          confidence: 0.82,
        },
        frustration: {
          type: "score",
          score: 1.26,
          probabilities: { "0": 0, "1": 0.74, "2": 0.26 },
          confidence: 0.61,
        },
        refund: { type: "boolean", probability: 0.97 },
      },
      usage: { inputTokens: 300, outputTokens: 9 },
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

    await expect(client.evaluate(request)).rejects.toMatchObject({
      name: "AI_APICallError",
      statusCode: 401,
      isRetryable: false,
    });
  });
});
