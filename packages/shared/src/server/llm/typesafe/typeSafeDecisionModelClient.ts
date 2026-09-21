import { z } from "zod";
import type {
  DecisionModelChoiceQuestion,
  DecisionModelClient,
  DecisionModelEvaluation,
} from "../../evals/decisionModelEvaluatorExecution";
import { createSecureLlmFetch } from "../secureLlmFetch";

export const TYPESAFE_DEFAULT_BASE_URL = "https://api.typesafe.ai/v1";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * HTTP failure from the TypeSafe API. Rate limits and server errors are
 * retryable; every other client error is permanent for the job.
 */
export class DecisionModelRequestError extends Error {
  readonly statusCode: number | undefined;
  readonly isRetryable: boolean;

  constructor(params: {
    message: string;
    statusCode?: number;
    isRetryable: boolean;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "DecisionModelRequestError";
    this.statusCode = params.statusCode;
    this.isRetryable = params.isRetryable;
  }
}

const SystemOneChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number().nullish(),
  probabilities: z.record(z.string(), z.number()),
});

const SystemOneResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), z.unknown()),
  usage: z
    .object({
      input_tokens: z.number().nullish(),
      output_tokens: z.number().nullish(),
    })
    .nullish(),
});

const QUESTION_ID = "verdict";

export function createTypeSafeDecisionModelClient(params: {
  apiKey: string;
  model: string;
  baseURL?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): DecisionModelClient {
  const baseURL = (params.baseURL?.trim() || TYPESAFE_DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const fetchImpl =
    params.fetchImpl ??
    createSecureLlmFetch({ logContext: "TypeSafe decision model" });
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    evaluateChoice: async ({ state, question }) => {
      const body = {
        model: params.model,
        state,
        questions: {
          [QUESTION_ID]: toSystemOneQuestion(question),
        },
      };

      let response: Response;
      try {
        response = await fetchImpl(`${baseURL}/systemone`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        throw new DecisionModelRequestError({
          message: `TypeSafe request failed: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          isRetryable: true,
          cause,
        });
      }

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new DecisionModelRequestError({
          message: `TypeSafe returned HTTP ${response.status}${
            detail ? `: ${detail}` : ""
          }`,
          statusCode: response.status,
          isRetryable: response.status === 429 || response.status >= 500,
        });
      }

      const parsed = SystemOneResponseSchema.safeParse(
        await response.json().catch(() => undefined),
      );
      if (!parsed.success) {
        throw new DecisionModelRequestError({
          message: "TypeSafe returned an unexpected response body",
          statusCode: response.status,
          isRetryable: false,
          cause: parsed.error,
        });
      }

      const answer = SystemOneChoiceAnswerSchema.safeParse(
        parsed.data.answers[QUESTION_ID],
      );
      if (!answer.success) {
        throw new DecisionModelRequestError({
          message: "TypeSafe returned no choice answer for the question",
          statusCode: response.status,
          isRetryable: false,
          cause: answer.error,
        });
      }

      const evaluation: DecisionModelEvaluation = {
        model: parsed.data.model,
        answer: {
          type: "choice",
          choice: answer.data.choice,
          probabilities: answer.data.probabilities,
          confidence: answer.data.confidence ?? null,
        },
        usage: parsed.data.usage
          ? {
              inputTokens: parsed.data.usage.input_tokens ?? null,
              outputTokens: parsed.data.usage.output_tokens ?? null,
            }
          : null,
      };
      return evaluation;
    },
  };
}

function toSystemOneQuestion(question: DecisionModelChoiceQuestion) {
  return {
    type: "choice",
    instructions: question.instructions,
    criteria: question.criteria,
  };
}

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text ? text.slice(0, 300) : null;
  } catch {
    return null;
  }
}
