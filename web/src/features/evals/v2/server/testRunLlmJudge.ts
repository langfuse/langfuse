import {
  ChatMessageRole,
  ChatMessageType,
  compilePersistedEvalOutputDefinition,
  eventTargetEvalVariableColumns,
  parseUnknownToPromptString,
  PersistedEvalOutputDefinitionSchema,
  validateEvalOutputResult,
  type ObservationForEval,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import {
  createW3CTraceId,
  DefaultEvalModelService,
  extractObservationVariables,
  fetchLLMCompletion,
  findModel,
  getObservationByIdFromEventsTable,
  INTERNAL_TRACE_EVENT_SOURCE,
  logger,
} from "@langfuse/shared/src/server";
import { writeTraceViaIngestion } from "@/src/features/evals/server/codeEvalTestRun";

// Prototype fallback for templates without an output definition (create from
// scratch). Mirrors the legacy managed-evaluator shape.
export const DEFAULT_OUTPUT_DEFINITION = {
  score:
    "Score between 0 and 1. Score 0 if false or negative and 1 if true or positive",
  reasoning: "One sentence reasoning for the score",
};

export type LlmJudgeTestRunResult =
  | {
      success: true;
      score: string | number | boolean;
      reasoning?: string | null;
      dataType: string;
      interpolatedPrompt: string;
      extractedVariables: { var: string; value: string }[];
      model: string;
      provider: string;
      executionTraceId?: string;
      /** Rough per-run cost (chars/4 token estimate × model prices);
          null when the model has no price entry. */
      estimatedCostUsd: number | null;
    }
  | {
      success: false;
      error: string;
      interpolatedPrompt?: string;
      extractedVariables?: { var: string; value: string }[];
      executionTraceId?: string;
    };

/**
 * Persists the judge call as an internal execution trace (same ingestion
 * path the code-eval test runs use) so "Execution trace" can link to it.
 * Best-effort: a write failure only costs the link, not the test result.
 */
async function writeJudgeExecutionTrace(params: {
  projectId: string;
  input: string;
  output: unknown;
  level?: "ERROR";
  statusMessage?: string;
  startTime: Date;
  metadata: Record<string, unknown>;
}): Promise<string | undefined> {
  const executionTraceId = createW3CTraceId();
  // W3C span ids are 16 hex chars; reuse the trace-id generator's entropy.
  const rootSpanId = createW3CTraceId().slice(0, 16);
  try {
    await writeTraceViaIngestion({
      rootSpanId,
      eventInputs: [
        {
          projectId: params.projectId,
          traceId: executionTraceId,
          spanId: rootSpanId,
          source: INTERNAL_TRACE_EVENT_SOURCE,
          startTimeISO: params.startTime.toISOString(),
          endTimeISO: new Date().toISOString(),
          name: "Test evaluator: LLM-as-a-judge",
          traceName: "Test evaluator: LLM-as-a-judge",
          input: params.input,
          output:
            params.output === null || params.output === undefined
              ? undefined
              : typeof params.output === "string"
                ? params.output
                : JSON.stringify(params.output),
          metadata: params.metadata,
          level: params.level,
          statusMessage: params.statusMessage,
        },
      ],
    });
    return executionTraceId;
  } catch (error) {
    logger.warn("Failed to write LLM judge test execution trace", { error });
    return undefined;
  }
}

/**
 * Prototype cost estimate for one judge call: chars/4 token approximation
 * priced with the model's default pricing tier. fetchLLMCompletion's
 * structured-output path doesn't surface real token usage, and the execution
 * trace carries no usage either — good enough to project a daily run cost.
 */
async function estimateJudgeCallCostUsd(params: {
  projectId: string;
  model: string;
  promptText: string;
  responseText: string;
}): Promise<number | null> {
  try {
    const { pricingTiers } = await findModel({
      projectId: params.projectId,
      model: params.model,
    });
    const tier =
      pricingTiers.find((t) => t.isDefault) ?? pricingTiers[0] ?? null;
    const inputPrice = tier?.prices.find((p) => p.usageType === "input")?.price;
    const outputPrice = tier?.prices.find(
      (p) => p.usageType === "output",
    )?.price;
    if (!inputPrice || !outputPrice) return null;
    const inputTokens = Math.ceil(params.promptText.length / 4);
    const outputTokens = Math.ceil(params.responseText.length / 4);
    return (
      inputPrice.toNumber() * inputTokens +
      outputPrice.toNumber() * outputTokens
    );
  } catch (error) {
    logger.info("Judge test-run cost estimate failed", { error });
    return null;
  }
}

// Same substitution the worker applies (worker/src/features/utils/utilities.ts).
// Not extracted to shared to keep this prototype self-contained.
function compileTemplateString(
  template: string,
  context: Record<string, string>,
): string {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (match, key) =>
    key in context ? context[key] : match,
  );
}

/**
 * Resolves the sample observation and extracts every mapped variable from it,
 * using the same shared extraction the worker's observation evals run.
 */
async function extractSampleVariables(params: {
  projectId: string;
  observationId: string;
  traceId: string;
  observationStartTime?: Date;
  mapping: ObservationVariableMapping[];
}): Promise<{ var: string; value: string }[]> {
  const observation = await getObservationByIdFromEventsTable({
    id: params.observationId,
    projectId: params.projectId,
    traceId: params.traceId,
    startTime: params.observationStartTime,
    fetchWithInputOutput: true,
  });

  if (!observation) {
    throw new Error(`Observation ${params.observationId} not found`);
  }

  // The extraction columns address input/output/metadata by identical
  // internal names, so the domain observation slots in directly.
  const extracted = extractObservationVariables(
    {
      observation: observation as unknown as ObservationForEval,
      variableMapping: params.mapping,
    },
    eventTargetEvalVariableColumns,
  );

  return extracted.map((v) => ({
    var: v.var,
    value: parseUnknownToPromptString(v.value),
  }));
}

export async function runLlmJudgeTest(params: {
  projectId: string;
  prompt: string;
  provider?: string | null;
  model?: string | null;
  modelParams?: unknown;
  outputDefinition?: unknown;
  mapping: ObservationVariableMapping[];
  observationId: string;
  traceId: string;
  observationStartTime?: Date;
}): Promise<LlmJudgeTestRunResult> {
  const variables = Array.from(
    new Set(
      [...params.prompt.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((m) => m[1]),
    ),
  );

  let extractedVariables: { var: string; value: string }[];
  try {
    const mapped = await extractSampleVariables({
      projectId: params.projectId,
      observationId: params.observationId,
      traceId: params.traceId,
      observationStartTime: params.observationStartTime,
      mapping: params.mapping,
    });
    // Unmapped prompt variables interpolate to "" (matching the mapped-but-
    // empty behavior) instead of leaking raw {{placeholders}} to the judge.
    extractedVariables = variables.map(
      (variable) =>
        mapped.find((v) => v.var === variable) ?? { var: variable, value: "" },
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const interpolatedPrompt = compileTemplateString(
    params.prompt,
    Object.fromEntries(extractedVariables.map((v) => [v.var, v.value])),
  );

  const outputDefinitionResult = PersistedEvalOutputDefinitionSchema.safeParse(
    params.outputDefinition ?? DEFAULT_OUTPUT_DEFINITION,
  );
  const compiledOutputDefinition = compilePersistedEvalOutputDefinition(
    outputDefinitionResult.success
      ? outputDefinitionResult.data
      : DEFAULT_OUTPUT_DEFINITION,
  );

  const modelConfig = await DefaultEvalModelService.fetchValidModelConfig(
    params.projectId,
    params.provider ?? undefined,
    params.model ?? undefined,
    params.modelParams ?? undefined,
  );

  if (!modelConfig.valid) {
    return {
      success: false,
      error: modelConfig.error,
      interpolatedPrompt,
      extractedVariables,
    };
  }

  const callStartTime = new Date();
  const traceMetadata = {
    model: modelConfig.config.model,
    provider: modelConfig.config.provider,
    target_trace_id: params.traceId,
    target_observation_id: params.observationId,
  };

  try {
    const response = await fetchLLMCompletion({
      streaming: false,
      llmConnection: modelConfig.config.apiKey,
      messages: [
        {
          type: ChatMessageType.User,
          role: ChatMessageRole.User,
          content: interpolatedPrompt,
        },
      ],
      modelParams: {
        provider: modelConfig.config.provider,
        model: modelConfig.config.model,
        adapter: modelConfig.config.apiKey.adapter,
        ...modelConfig.config.modelParams,
      },
      structuredOutputSchema: compiledOutputDefinition.outputResultSchema,
      maxRetries: 1,
    });

    const executionTraceId = await writeJudgeExecutionTrace({
      projectId: params.projectId,
      input: interpolatedPrompt,
      output: response,
      startTime: callStartTime,
      metadata: traceMetadata,
    });

    const validated = validateEvalOutputResult({
      response,
      compiledOutputDefinition,
    });

    if (!validated.success) {
      return {
        success: false,
        error: `Model returned an unexpected result: ${validated.error}`,
        interpolatedPrompt,
        extractedVariables,
        executionTraceId,
      };
    }

    const estimatedCostUsd = await estimateJudgeCallCostUsd({
      projectId: params.projectId,
      model: modelConfig.config.model,
      promptText: interpolatedPrompt,
      responseText: JSON.stringify(response) ?? "",
    });

    return {
      success: true,
      score:
        "score" in validated.data
          ? validated.data.score
          : validated.data.matches.join(", "),
      reasoning: validated.data.reasoning,
      dataType: validated.data.dataType,
      interpolatedPrompt,
      extractedVariables,
      model: modelConfig.config.model,
      provider: modelConfig.config.provider,
      executionTraceId,
      estimatedCostUsd,
    };
  } catch (error) {
    logger.info("LLM judge test run failed", { error });
    const message = error instanceof Error ? error.message : String(error);
    const executionTraceId = await writeJudgeExecutionTrace({
      projectId: params.projectId,
      input: interpolatedPrompt,
      output: null,
      level: "ERROR",
      statusMessage: message,
      startTime: callStartTime,
      metadata: traceMetadata,
    });
    return {
      success: false,
      error: message,
      interpolatedPrompt,
      extractedVariables,
      executionTraceId,
    };
  }
}
