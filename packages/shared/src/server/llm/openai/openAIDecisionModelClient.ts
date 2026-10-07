import { APICallError } from "ai";
import { z } from "zod";
import type { DecisionModelEntry } from "../../../features/evals/decisionModel";
import {
  DecisionModelEvaluatorError,
  type DecisionModelAnswer,
  type DecisionModelClient,
  type DecisionModelEvaluation,
  type DecisionModelRequest,
} from "../../evals/decisionModelEvaluatorExecution";
import { createSecureLlmFetch } from "../secureLlmFetch";

const OPENAI_DECISIONS_BASE_URL = "https://api.openai.com/v1";

const probability = z.number();
const responseSchema = z.object({
  model: z.string().nullish(),
  usage: z
    .object({
      input_tokens: z.number().nullish(),
      output_tokens: z.number().nullish(),
    })
    .nullish(),
  answers: z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("refusal"), name: z.string().nullable() }),
      z.object({
        type: z.literal("predicate"),
        name: z.string(),
        probability,
      }),
      z.object({
        type: z.literal("choice"),
        name: z.string(),
        choice: z.union([z.string(), z.boolean()]),
        confidence: probability.nullish(),
        probabilities: z.array(
          z.object({
            value: z.union([z.string(), z.boolean()]),
            probability,
          }),
        ),
      }),
      z.object({
        type: z.literal("score"),
        name: z.string(),
        score: z.number(),
        confidence: probability.nullish(),
        probabilities: z.array(z.object({ value: z.number(), probability })),
      }),
    ]),
  ),
});

function parseErrorData(responseBody: string): unknown {
  try {
    return JSON.parse(responseBody);
  } catch {
    return undefined;
  }
}

function entryText(entry: DecisionModelEntry | null | undefined) {
  if (entry == null) return undefined;
  return typeof entry === "string" ? entry : JSON.stringify(entry);
}

function toOpenAIQuestions(questions: DecisionModelRequest["questions"]) {
  return Object.entries(questions).map(([name, question]) => {
    const instructions = entryText(question.instructions) ?? "";
    switch (question.type) {
      case "predicate":
        return { type: "predicate" as const, name, instructions };
      case "choice":
        return {
          type: "choice" as const,
          name,
          instructions,
          choices: question.choices.map((choice) => ({
            value: choice.value,
            ...(entryText(choice.description) == null
              ? {}
              : { description: entryText(choice.description) }),
          })),
        };
      case "score":
        return {
          type: "score" as const,
          name,
          instructions,
          levels: question.levels.map((level, index) => {
            if (!level.label) {
              throw new DecisionModelEvaluatorError(
                `OpenAI score question "${name}" is missing a label for level ${index}.`,
              );
            }
            const text = entryText(level.description);
            return {
              label: level.label,
              ...(text == null ? {} : { description: text }),
            };
          }),
        };
    }
  });
}

export function createOpenAIDecisionModelClient(params: {
  apiKey: string;
  model: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): DecisionModelClient {
  const fetchImpl =
    params.fetchImpl ??
    createSecureLlmFetch({
      logContext: "OpenAI decision model",
      additionalSensitiveHeaders: Object.keys(params.extraHeaders ?? {}),
    });
  const baseURL = (params.baseURL ?? OPENAI_DECISIONS_BASE_URL).replace(
    /\/$/,
    "",
  );

  return {
    evaluate: async (request) => {
      const url = `${baseURL}/decisions`;
      const body = {
        model: params.model,
        input: JSON.stringify(request.state),
        questions: toOpenAIQuestions(request.questions),
      };
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          ...params.extraHeaders,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const responseBody = (await response.text()).slice(0, 500);
        // statusCode lets a bad key, exhausted billing, or a missing model pause the evaluator.
        throw new APICallError({
          message: `OpenAI Decisions request failed (${response.status}): ${responseBody}`,
          url,
          requestBodyValues: body,
          statusCode: response.status,
          responseBody,
          data: parseErrorData(responseBody),
        });
      }

      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new DecisionModelEvaluatorError(
          "OpenAI Decisions returned a response this evaluator cannot read.",
        );
      }

      const refused = parsed.data.answers.filter(
        (answer) => answer.type === "refusal",
      );
      if (refused.length > 0) {
        const names = refused.map((answer) => answer.name ?? "unnamed");
        throw new DecisionModelEvaluatorError(
          `OpenAI declined to answer: ${names.join(", ")}.`,
        );
      }

      const answers: Record<string, DecisionModelAnswer> = {};
      for (const answer of parsed.data.answers) {
        if (answer.type === "refusal") continue;
        switch (answer.type) {
          case "predicate":
            answers[answer.name] = {
              type: "boolean",
              probability: answer.probability,
            };
            break;
          case "choice":
            answers[answer.name] = {
              type: "choice",
              choice: String(answer.choice),
              probabilities: Object.fromEntries(
                answer.probabilities.map(({ value, probability }) => [
                  String(value),
                  probability,
                ]),
              ),
              confidence: answer.confidence ?? null,
            };
            break;
          case "score":
            answers[answer.name] = {
              type: "score",
              score: answer.score,
              probabilities: Object.fromEntries(
                answer.probabilities.map(({ value, probability }) => [
                  String(value),
                  probability,
                ]),
              ),
              confidence: answer.confidence ?? null,
            };
            break;
        }
      }

      const evaluation: DecisionModelEvaluation = {
        model: parsed.data.model ?? params.model,
        answers,
        usage: {
          inputTokens: parsed.data.usage?.input_tokens ?? null,
          outputTokens: parsed.data.usage?.output_tokens ?? null,
        },
      };
      return evaluation;
    },
  };
}
