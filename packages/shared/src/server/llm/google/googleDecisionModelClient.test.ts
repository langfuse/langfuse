import { describe, expect, it, vi } from "vitest";
import type { DecisionModelRequest } from "../../evals/decisionModelEvaluatorExecution";
import { createDecisionModelClient } from "../createDecisionModelClient";
import { createSecureLlmFetch } from "../secureLlmFetch";
import { LLMAdapter } from "../types";

vi.mock("../secureLlmFetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../secureLlmFetch")>();
  return {
    ...actual,
    createSecureLlmFetch: vi.fn(actual.createSecureLlmFetch),
  };
});

const request: DecisionModelRequest = {
  state: { input: "I was charged twice." },
  questions: {
    department: {
      type: "choice",
      instructions: "Which team should handle the request?",
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
      instructions: "Does the request ask for a refund?",
      criteria: { true: "Asks for money back", false: { note: "money" } },
    },
  },
};

describe("Google AI Studio decision models", () => {
  it("posts one text input to the Gemini decisions endpoint and maps answers with confidence", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: {
            department: {
              type: "choice",
              choice: "billing",
              probabilities: { billing: 0.9, other: 0.1 },
              confidence: 0.8,
            },
            severity: {
              type: "score",
              score: 0.7,
              probabilities: { "0": 0.3, "1": 0.7 },
              confidence: 0.6,
            },
            refund: { type: "noul", noul: 0.95 },
          },
          usage: { total_input_tokens: 120, total_output_tokens: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = createDecisionModelClient({
      adapter: LLMAdapter.GoogleAIStudio,
      apiKey: "google-test-key",
      model: "gemini-decision-1",
      fetchImpl,
    });
    const evaluation = await client.evaluate(request);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/decisions",
    );
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(
      "google-test-key",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      model: "gemini-decision-1",
      input: [{ type: "text", text: JSON.stringify(request.state) }],
      questions: {
        department: {
          type: "choice",
          instructions: "Which team should handle the request?",
          criteria: { billing: "Payments and refunds", other: null },
        },
        severity: {
          type: "score",
          instructions: "How severe is the issue?",
          criteria: ["Appearance only", "Blocked"],
        },
        refund: {
          type: "noul",
          instructions: "Does the request ask for a refund?",
          criteria: {
            true_description: "Asks for money back",
            false_description: '{"note":"money"}',
          },
        },
      },
    });
    expect(evaluation).toEqual({
      model: "gemini-decision-1",
      answers: {
        department: {
          type: "choice",
          choice: "billing",
          probabilities: { billing: 0.9, other: 0.1 },
          confidence: 0.8,
        },
        severity: {
          type: "score",
          score: 0.7,
          probabilities: { "0": 0.3, "1": 0.7 },
          confidence: 0.6,
        },
        refund: { type: "boolean", probability: 0.95 },
      },
      usage: { inputTokens: 120, outputTokens: 0 },
    });
  });

  it("strips the API key on cross-origin redirects", () => {
    createDecisionModelClient({
      adapter: LLMAdapter.GoogleAIStudio,
      apiKey: "google-key",
      model: "gemini-decision-1",
    });

    expect(vi.mocked(createSecureLlmFetch)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        additionalSensitiveHeaders: ["X-Goog-Api-Key"],
      }),
    );
  });
});
