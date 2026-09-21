import type { EvaluatorPromptMessage } from "@langfuse/shared";

/**
 * Decision-model instructions are stored in the version prompt. The evaluator
 * service normalizes every version prompt into prompt messages before it
 * reaches the client, so the instructions arrive as a single user message.
 */
export function getDecisionModelInstructions(version: {
  promptMessages: EvaluatorPromptMessage[] | null;
}): string {
  return (version.promptMessages ?? [])
    .map((message) => message.content)
    .join("\n\n");
}
