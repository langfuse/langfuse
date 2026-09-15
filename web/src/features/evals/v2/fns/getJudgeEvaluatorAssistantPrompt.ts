import type { EvaluatorAssistantSampleObservation } from "@/src/features/evals/v2/types/EvaluatorAssistantSampleObservation";

export function getJudgeEvaluatorAssistantPrompt({
  evaluatorId,
  request,
  sampleObservation,
}: {
  evaluatorId: string;
  request: string;
  sampleObservation?: EvaluatorAssistantSampleObservation | null;
}) {
  const sampleTestInstructions = sampleObservation
    ? `

After the update, test the updated evaluator against the sample observation selected by the user with these exact test parameters:
- evaluatorId: "${evaluatorId}"
- observationId: "${sampleObservation.observationId}"
- traceId: "${sampleObservation.traceId}"
- startTime: "${sampleObservation.startTime}"

Use the evaluator test tool with these references; do not substitute another observation and do not set silent mode so the result can be shown in the evaluator test panel.`
    : "";

  return `Update the LLM-as-a-judge evaluator with evaluator ID "${evaluatorId}" for this request:

${request}

First load this evaluator. Preserve its existing name, model configuration, output definition, variable mapping, and prompt-message structure unless the request requires a change. Ask follow-up questions if the request is ambiguous. Use the evaluator update tool with evaluator ID "${evaluatorId}" after I approve the tool call. When updating prompts, pass promptMessages rather than collapsing them into one prompt. Do not create a new evaluator.${sampleTestInstructions}`;
}
