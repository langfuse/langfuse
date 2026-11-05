import { EvaluatorBlockReason } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { classifyEvaluatorLlmError } from "../../evals/classifyEvaluatorLlmError";
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
      levels: [{ description: "Appearance only" }, { description: "Blocked" }],
    },
    refund: {
      type: "predicate",
      instructions: "Does `input` request a refund?",
      criteria: { true: "Asks for money back", false: { note: "money" } },
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
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: JSON.stringify(request.state) },
          ],
        },
      ],
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
            'Does `input` request a refund?\n\nCriteria for true:\nAsks for money back\n\nCriteria for false:\n{"note":"money"}',
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

  it.each([
    ["plain text", "Not Found", "text/plain"],
    ["an HTML page", "<html><body>404</body></html>", "text/html"],
    [
      "a gateway JSON body",
      JSON.stringify({ detail: "Not Found" }),
      "application/json",
    ],
  ])(
    "explains a 404 with %s as a base URL without the decisions endpoint",
    async (_, body, contentType) => {
      const fetchImpl = vi.fn().mockImplementation(
        () =>
          new Response(body, {
            status: 404,
            statusText: "Not Found",
            headers: { "Content-Type": contentType },
          }),
      );
      const client = createOpenAIDecisionModelClient({
        apiKey: "sk-test",
        model: "gpt-6-luna",
        baseURL: "https://llm-proxy.example.com/v1",
        fetchImpl,
      });

      const error = await client.evaluate(request).catch((e: unknown) => e);
      expect(classifyEvaluatorLlmError(error)?.blockReason).toBe(
        EvaluatorBlockReason.EVAL_MODEL_UNAVAILABLE,
      );
      expect(error).toMatchObject({
        name: "AI_APICallError",
        statusCode: 404,
        isRetryable: false,
        message:
          "The decision-model endpoint was not found (POST https://llm-proxy.example.com/v1/decisions returned 404). Check that the connection's base URL supports OpenAI's /decisions endpoint, for example the default https://api.openai.com/v1.",
      });
    },
  );

  it("keeps the provider's message for a 404 with an OpenAI error body", async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      jsonResponse(
        {
          error: {
            message:
              "The model `gpt-6-luna` does not exist or you do not have access to it.",
            type: "invalid_request_error",
            code: "model_not_found",
          },
        },
        404,
      ),
    );
    const client = createOpenAIDecisionModelClient({
      apiKey: "sk-test",
      model: "gpt-6-luna",
      fetchImpl,
    });

    await expect(client.evaluate(request)).rejects.toMatchObject({
      name: "AI_APICallError",
      statusCode: 404,
      message:
        "The model `gpt-6-luna` does not exist or you do not have access to it.",
    });
  });

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

    await expect(client.evaluate(request)).rejects.toMatchObject({
      name: "DecisionModelEvaluatorError",
      message: "OpenAI declined to answer: refund.",
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
