import { formatDecisionModelPredicateInstructions } from "@/src/fns/formatDecisionModelPredicateInstructions";
import { postExternalGuardrailTest } from "@/src/features/ai-gateway/server/guardrails/postExternalGuardrailTest";
import type { GatewayDecisionModelGuardrailConfig } from "@/src/features/ai-gateway/types/gatewayGuardrail";

const QUESTION_NAME = "guardrail";

/**
 * Checks the selected gateway connection, model, and yes/no question against
 * `/v1/decisions` with one harmless input; throws `ProviderCredentialRejectedError`
 * on rejection or an unexpected answer shape.
 */
export async function validateDecisionModelGuardrail(
  params: GatewayDecisionModelGuardrailConfig & {
    baseUrl: string;
    baseURL: string | null;
    apiKey: string;
    extraHeaders: Record<string, string>;
  },
) {
  const instructions = formatDecisionModelPredicateInstructions(
    params.question,
    params.criteria,
  );
  await postExternalGuardrailTest({
    url: `${params.baseUrl.replace(/\/+$/, "")}/decisions`,
    apiKey: params.apiKey,
    baseURL: params.baseURL,
    extraHeaders: params.extraHeaders,
    body: {
      model: params.model,
      input: "Hello",
      questions: [
        {
          type: "predicate",
          name: QUESTION_NAME,
          instructions,
        },
      ],
    },
    providerName: "Decision model",
    unreachableMessage:
      "Could not reach the decision model endpoint on the selected connection.",
    isExpectedResponse: hasValidPredicateAnswer,
  });
}

function hasValidPredicateAnswer(json: unknown): boolean {
  if (!json || typeof json !== "object" || !("answers" in json)) return false;
  const answers = (json as { answers?: unknown }).answers;
  if (!Array.isArray(answers)) return false;
  const matching = answers.filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) &&
      typeof entry === "object" &&
      (entry as { name?: unknown }).name === QUESTION_NAME,
  );
  if (matching.length !== 1) return false;
  const answer = matching[0];
  return (
    answer.type === "predicate" &&
    typeof answer.probability === "number" &&
    Number.isFinite(answer.probability) &&
    answer.probability >= 0 &&
    answer.probability <= 1
  );
}
