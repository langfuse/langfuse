import { describe, expect, it, vi } from "vitest";
import { DecisionModelEvaluatorError } from "../../evals/decisionModelEvaluatorExecution";
import type { DecisionModelRequest } from "../../evals/decisionModelEvaluatorExecution";
import { createOpenAIDecisionModelClient } from "./openAIDecisionModelClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const request: DecisionModelRequest = {
  state: { input: "I was charged twice.", output: "Refund issued." },
  questions: {
    department: {
      type: "choice",
      instructions: "Which team should handle `input`?",
      choices: [
        { value: "billing", description: "Payments and refunds" },
        { value: "other" },
      ],
    },
    severity: {
      type: "score",
      instructions: "How severe is the issue?",
      levels: [
        { label: "Cosmetic", description: "Appearance only" },
        { label: "Blocked" },
      ],
    },
    refund: {
      type: "predicate",
      instructions: "Does `input` request a refund?",
      criteria: { true: "Asks for money back" },
    },
  },
};

describe("createOpenAIDecisionModelClient", () => {
  it("posts text input and maps predicate, choice, and score answers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: "gpt-6-luna",
        answers: [
          {
            type: "choice",
            name: "department",
            choice: "billing",
            confidence: 0.8,
            probabilities: [
              { value: "billing", probability: 0.9 },
              { value: "other", probability: 0.1 },
            ],
          },
          {
            type: "score",
            name: "severity",
            score: 0.4,
            confidence: 0.7,
            probabilities: [
              { value: 0, probability: 0.6 },
              { value: 1, probability: 0.4 },
            ],
          },
          { type: "predicate", name: "refund", probability: 0.95 },
        ],
        usage: { input_tokens: 120, output_tokens: 3 },
      }),
    );

    const client = createOpenAIDecisionModelClient({
      apiKey: "sk-test",
      model: "gpt-6-luna",
      fetchImpl,
    });
    const evaluation = await client.evaluate(request);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/decisions");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer sk-test",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      model: "gpt-6-luna",
      input: JSON.stringify(request.state),
      questions: [
        {
          type: "choice",
          name: "department",
          instructions: "Which team should handle `input`?",
          choices: [
            { value: "billing", description: "Payments and refunds" },
            { value: "other" },
          ],
        },
        {
          type: "score",
          name: "severity",
          instructions: "How severe is the issue?",
          levels: [
            { label: "0", description: "Appearance only" },
            { label: "1", description: "Blocked" },
          ],
        },
        {
          type: "predicate",
          name: "refund",
          instructions:
            "Does `input` request a refund?\n\nCriteria for true:\nAsks for money back",
        },
      ],
    });
    expect(evaluation).toEqual({
      model: "gpt-6-luna",
      answers: {
        department: {
          type: "choice",
          choice: "billing",
          probabilities: { billing: 0.9, other: 0.1 },
          confidence: 0.8,
        },
        severity: {
          type: "score",
          score: 0.4,
          probabilities: { "0": 0.6, "1": 0.4 },
          confidence: 0.7,
        },
        refund: { type: "boolean", probability: 0.95 },
      },
      usage: { inputTokens: 120, outputTokens: 3 },
    });
  });

  it.each([
    [401, false],
    [500, true],
  ])(
    "surfaces HTTP %s as an AI SDK call error (retryable: %s)",
    async (status, isRetryable) => {
      const fetchImpl = vi
        .fn()
        .mockImplementation(() =>
          jsonResponse(
            { error: { message: "nope", type: "invalid_request_error" } },
            status,
          ),
        );
      const client = createOpenAIDecisionModelClient({
        apiKey: "sk-bad",
        model: "gpt-6-luna",
        fetchImpl,
      });

      await expect(client.evaluate(request)).rejects.toMatchObject({
        name: "AI_APICallError",
        statusCode: status,
        isRetryable,
      });
    },
  );

  it("fails the call when any question is refused", async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      jsonResponse({
        model: "gpt-6-luna",
        answers: [
          {
            type: "choice",
            name: "department",
            choice: "billing",
            probabilities: [
              { value: "billing", probability: 1 },
              { value: "other", probability: 0 },
            ],
          },
          {
            type: "score",
            name: "severity",
            score: 0,
            probabilities: [
              { value: 0, probability: 1 },
              { value: 1, probability: 0 },
            ],
          },
          { type: "refusal", name: "refund" },
        ],
      }),
    );
    const client = createOpenAIDecisionModelClient({
      apiKey: "sk-test",
      model: "gpt-6-luna",
      fetchImpl,
    });

    await expect(client.evaluate(request)).rejects.toBeInstanceOf(
      DecisionModelEvaluatorError,
    );
    await expect(client.evaluate(request)).rejects.toThrow(
      /declined to answer: refund/,
    );
  });

  it("serializes JSON instructions and criteria before the request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: "gpt-6-luna",
        answers: [{ type: "predicate", name: "refund", probability: 0.5 }],
      }),
    );
    const client = createOpenAIDecisionModelClient({
      apiKey: "sk-test",
      model: "gpt-6-luna",
      fetchImpl,
    });

    await client.evaluate({
      state: { input: { text: "refund please" } },
      questions: {
        refund: {
          type: "predicate",
          instructions: { rubric: "refund asked" },
          criteria: { true: { note: "money" } },
        },
      },
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      input: JSON.stringify({ input: { text: "refund please" } }),
      questions: [
        {
          type: "predicate",
          name: "refund",
          instructions:
            '{"rubric":"refund asked"}\n\nCriteria for true:\n{"note":"money"}',
        },
      ],
    });
  });

  it("appends /decisions to a custom base URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: "gpt-6-luna",
        answers: [{ type: "predicate", name: "refund", probability: 0.5 }],
      }),
    );
    const client = createOpenAIDecisionModelClient({
      apiKey: "sk-test",
      model: "gpt-6-luna",
      baseURL: "https://llm-proxy.example.com/v1/",
      fetchImpl,
    });

    await client.evaluate({
      state: request.state,
      questions: { refund: request.questions.refund },
    });

    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm-proxy.example.com/v1/decisions");
  });
});
