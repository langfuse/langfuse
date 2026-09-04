export type EvaluatorAssistantSampleObservation = {
  observationId: string;
  traceId: string;
  startTime: string;
};

export function getEvaluatorAssistantSampleObservation(
  observation: {
    id: string;
    traceId: string | null;
    startTime: Date | null;
  } | null,
): EvaluatorAssistantSampleObservation | null {
  const observationId = observation?.id.trim();
  const traceId = observation?.traceId?.trim();
  const startTime = observation?.startTime;

  if (
    !observationId ||
    !traceId ||
    !startTime ||
    Number.isNaN(startTime.getTime())
  ) {
    return null;
  }

  return {
    observationId,
    traceId,
    startTime: startTime.toISOString(),
  };
}

export function getCodeEvaluatorAssistantPrompt({
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

  return `Update the code evaluator with evaluator ID "${evaluatorId}" for this request:

${request}

First load this evaluator and preserve its existing configuration unless the request requires a change. Ask follow-up questions if the request is ambiguous. Use the evaluator update tool with evaluator ID "${evaluatorId}" after I approve the tool call. Do not create a new evaluator.${sampleTestInstructions}`;
}

export async function startCodeEvaluatorAssistantHandoff({
  request,
  sampleObservation,
  conversationId,
  openAssistant,
  persistEvaluator,
  submitToAssistant,
}: {
  request: string;
  conversationId: string;
  sampleObservation?: EvaluatorAssistantSampleObservation | null;
  openAssistant: () => boolean;
  persistEvaluator: () => Promise<string | null>;
  submitToAssistant: (
    prompt: string,
    options: {
      newConversation: true;
      conversationId: string;
      entryPoint: "code-evaluator-editor";
    },
  ) => Promise<boolean>;
}) {
  if (!openAssistant()) return null;

  const evaluatorId = await persistEvaluator();
  if (!evaluatorId) return null;

  const started = await submitToAssistant(
    getCodeEvaluatorAssistantPrompt({
      evaluatorId,
      request,
      sampleObservation,
    }),
    {
      newConversation: true,
      conversationId,
      entryPoint: "code-evaluator-editor",
    },
  );

  return { evaluatorId, started };
}
