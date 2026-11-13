import {
  extractTranscriptEvalVariables,
  getCodeEvalVariableMapping,
  InvalidRequestError,
  isTraceTranscriptEvalType,
  observationVariableMappingList,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import {
  buildEvalExecutionData,
  createDecisionModelClient,
  createW3CTraceId,
  decryptAndParseExtraHeaders,
  DefaultEvalModelService,
  executeDecisionModelEvaluator,
  executeLlmEvaluator,
  extractObservationVariables,
  findModel,
  generateLlmEvaluatorOutput,
  getTraceByIdFromEventsTable,
  isAllowedDecisionModel,
  LLMAdapter,
  OPENAI_DECISION_MODEL_IDS,
  LangfuseInternalTraceEnvironment,
  matchPricingTier,
  resolveConfiguredCodeEvalDispatcher,
  runCodeBasedEvaluationDispatch,
  type DecisionModelRequest,
  type ExtractedVariable,
} from "@langfuse/shared/src/server";
import { getObservationForEvalById } from "@/src/features/evals/server/getObservationForEvalById";
import { loadTraceTranscript } from "@/src/features/events/server/loadTraceTranscript";
import type { NormalizedEvaluatorDefinition } from "./evaluatorTypes";
import {
  assertCompleteEvaluatorVariableMapping,
  extractEvaluatorPromptVariables,
} from "./evaluatorValidation";

export async function testEvaluator(params: {
  orgId: string;
  projectId: string;
  evaluatorId: string;
  includeEvaluatorLink?: boolean;
  definition: NormalizedEvaluatorDefinition;
  observationId: string;
  traceId: string;
  startTime: Date;
  shouldReadFromObservationsTable?: boolean;
}) {
  const startedAt = Date.now();
  const observation = await getObservationForEvalById({
    projectId: params.projectId,
    id: params.observationId,
    traceId: params.traceId,
    startTime: params.startTime,
    shouldReadFromObservationsTable: params.shouldReadFromObservationsTable,
  });
  const variables = extractObservationVariables({
    observation,
    variableMapping: resolveTestVariableMapping(params.definition),
  });
  const executionData = buildEvalExecutionData({
    type: "TEST",
    evaluatorId:
      params.includeEvaluatorLink === false ? null : params.evaluatorId,
    targetTraceId: params.traceId,
    targetObservationId: params.observationId,
  });

  const result = await runEvaluatorTest({
    ...params,
    variables,
    hasExperimentContext: Boolean(observation.experiment_id),
    ...executionData,
  });

  return { ...result, durationMs: Date.now() - startedAt, variables };
}

/**
 * Runs the evaluator on a trace transcript the way a trace transcript rule
 * would: every variable reads the `threads` of the assembled transcript.
 */
export async function testEvaluatorOnTrace(params: {
  orgId: string;
  projectId: string;
  evaluatorId: string;
  includeEvaluatorLink?: boolean;
  definition: NormalizedEvaluatorDefinition;
  traceId: string;
  /** Any time inside the trace; the transcript is read from the trace start. */
  timestamp: Date;
}) {
  const startedAt = Date.now();
  if (!isTraceTranscriptEvalType(params.definition.type)) {
    throw new InvalidRequestError(
      "Trace evaluations support LLM-as-a-judge and decision-model evaluators.",
    );
  }
  const variableMapping = resolveTestVariableMapping(params.definition);
  const trace = await getTraceByIdFromEventsTable({
    traceId: params.traceId,
    projectId: params.projectId,
    fromTimestamp: params.timestamp,
    excludeInputOutput: true,
    excludeMetadata: true,
  });
  const { transcript } = await loadTraceTranscript({
    projectId: params.projectId,
    traceId: params.traceId,
    timestamp: trace?.timestamp ?? params.timestamp,
    context: "other",
  });
  if (!transcript) {
    return {
      success: false as const,
      error: "This trace has no transcript to evaluate.",
      durationMs: Date.now() - startedAt,
      variables: [],
    };
  }
  const extracted = extractTranscriptEvalVariables(
    transcript.threads,
    variableMapping,
  );
  if (!extracted.ok) throw new InvalidRequestError(extracted.error);

  const executionData = buildEvalExecutionData({
    type: "TEST",
    evaluatorId:
      params.includeEvaluatorLink === false ? null : params.evaluatorId,
    targetTraceId: params.traceId,
    targetObservationId: null,
  });
  const result = await runEvaluatorTest({
    ...params,
    variables: extracted.variables,
    hasExperimentContext: false,
    ...executionData,
  });

  return {
    ...result,
    durationMs: Date.now() - startedAt,
    variables: extracted.variables,
  };
}

function resolveTestVariableMapping(definition: NormalizedEvaluatorDefinition) {
  if (definition.type === "CODE") return getCodeEvalVariableMapping();
  if (definition.type === "DECISION_MODEL") {
    assertCompleteEvaluatorVariableMapping({
      promptVariables: definition.vars,
      variableMapping: definition.variableMapping,
    });
    return observationVariableMappingList.parse(definition.variableMapping);
  }
  const llmVariableMapping = definition.variableMapping ?? [];
  assertCompleteEvaluatorVariableMapping({
    promptVariables: extractEvaluatorPromptVariables(definition.promptMessages),
    variableMapping: llmVariableMapping,
  });
  return observationVariableMappingList.parse(llmVariableMapping);
}

async function runEvaluatorTest(params: {
  orgId: string;
  projectId: string;
  evaluatorId: string;
  definition: NormalizedEvaluatorDefinition;
  variables: ExtractedVariable[];
  hasExperimentContext: boolean;
  executionMetadata: Record<string, string>;
  evaluationContext: ReturnType<
    typeof buildEvalExecutionData
  >["evaluationContext"];
}) {
  switch (params.definition.type) {
    case "CODE":
      return testCodeEvaluator({ ...params, definition: params.definition });
    case "DECISION_MODEL":
      return testDecisionModelEvaluator({
        projectId: params.projectId,
        definition: params.definition,
        variables: params.variables,
      });
    case "LLM_AS_JUDGE":
      return testLlmEvaluator({ ...params, definition: params.definition });
  }
}

async function testDecisionModelEvaluator(params: {
  projectId: string;
  definition: Extract<
    NormalizedEvaluatorDefinition,
    { type: "DECISION_MODEL" }
  >;
  variables: ExtractedVariable[];
}) {
  const modelConfig = await DefaultEvalModelService.fetchValidModelConfig(
    params.projectId,
    params.definition.provider,
    params.definition.model,
  );
  if (!modelConfig.valid) {
    return { success: false as const, error: modelConfig.error };
  }
  if (
    !isAllowedDecisionModel(
      modelConfig.config.apiKey.adapter,
      modelConfig.config.model,
    )
  ) {
    return {
      success: false as const,
      error:
        modelConfig.config.apiKey.adapter === LLMAdapter.OpenAI
          ? `Model "${modelConfig.config.model}" is not supported for decision models. Use ${OPENAI_DECISION_MODEL_IDS.join(", ")}.`
          : `Connection "${params.definition.provider}" is not a decision-model connection.`,
    };
  }

  const executionTraceId = createW3CTraceId();
  let request: DecisionModelRequest | undefined;
  try {
    const client = createDecisionModelClient({
      adapter: modelConfig.config.apiKey.adapter,
      apiKey: decrypt(modelConfig.config.apiKey.secretKey),
      model: modelConfig.config.model,
      baseURL: modelConfig.config.apiKey.baseURL,
      extraHeaders: decryptAndParseExtraHeaders(
        modelConfig.config.apiKey.extraHeaders,
      ),
    });
    const execution = await executeDecisionModelEvaluator({
      variables: params.variables,
      questions: params.definition.questions,
      client: {
        evaluate: (sent) => {
          request = sent;
          return client.evaluate(sent);
        },
      },
    });

    const usage = execution.evaluation.usage;
    return {
      success: true as const,
      scores: execution.scores,
      request: execution.request,
      model: execution.evaluation.model,
      provider: modelConfig.config.provider,
      executionTraceId,
      estimatedCostUsd: usage
        ? await calculateTestRunCost({
            projectId: params.projectId,
            model: execution.evaluation.model,
            usage: {
              input: usage.inputTokens ?? 0,
              output: usage.outputTokens ?? 0,
            },
          })
        : null,
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : String(error),
      request,
      executionTraceId,
    };
  }
}

async function testLlmEvaluator(params: {
  projectId: string;
  evaluatorId: string;
  definition: Extract<NormalizedEvaluatorDefinition, { type: "LLM_AS_JUDGE" }>;
  variables: ExtractedVariable[];
  executionMetadata: Record<string, string>;
  evaluationContext: ReturnType<
    typeof buildEvalExecutionData
  >["evaluationContext"];
}) {
  const modelConfig = await DefaultEvalModelService.fetchValidModelConfig(
    params.projectId,
    params.definition.provider ?? undefined,
    params.definition.model ?? undefined,
    params.definition.modelParams ?? undefined,
  );
  if (!modelConfig.valid)
    return { success: false as const, error: modelConfig.error };

  const executionTraceId = createW3CTraceId();
  let interpolatedPrompt: string | undefined;
  let estimatedCostUsd: number | null = null;
  try {
    const execution = await executeLlmEvaluator({
      promptMessages: params.definition.promptMessages,
      variables: params.variables,
      outputDefinition: params.definition.outputDefinition,
      callLlm: async ({
        messages,
        compiledOutputDefinition,
        interpolatedPrompt: prompt,
      }) => {
        interpolatedPrompt = prompt;
        const result = await generateLlmEvaluatorOutput({
          projectId: params.projectId,
          connection: modelConfig.config.apiKey,
          modelParams: {
            provider: modelConfig.config.provider,
            model: modelConfig.config.model,
            adapter: modelConfig.config.apiKey.adapter,
            ...modelConfig.config.modelParams,
          },
          messages,
          outputResultSchema: compiledOutputDefinition.outputResultSchema,
          trace: {
            targetProjectId: params.projectId,
            traceId: executionTraceId,
            traceName: "Test evaluator",
            environment: LangfuseInternalTraceEnvironment.LLMJudge,
            metadata: params.executionMetadata,
            evaluationContext: params.evaluationContext,
          },
        });
        estimatedCostUsd = await calculateTestRunCost({
          projectId: params.projectId,
          model: modelConfig.config.model,
          usage: {
            input: result.usage.inputTokens ?? 0,
            output: result.usage.outputTokens ?? 0,
            total: result.usage.totalTokens ?? 0,
          },
        });
        return result.output;
      },
    });

    return execution.output.success
      ? {
          success: true as const,
          result: execution.output.data,
          interpolatedPrompt: execution.interpolatedPrompt,
          model: modelConfig.config.model,
          provider: modelConfig.config.provider,
          executionTraceId,
          estimatedCostUsd,
        }
      : {
          success: false as const,
          error: execution.output.error,
          interpolatedPrompt: execution.interpolatedPrompt,
          executionTraceId,
        };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : String(error),
      interpolatedPrompt,
      executionTraceId,
    };
  }
}

async function calculateTestRunCost({
  projectId,
  model,
  usage,
}: {
  projectId: string;
  model: string;
  usage: Record<string, number>;
}) {
  const { pricingTiers } = await findModel({ projectId, model });
  const pricing = matchPricingTier(pricingTiers, usage);
  if (!pricing) return null;

  const costs = Object.fromEntries(
    Object.entries(usage).flatMap(([usageType, units]) => {
      const price = pricing.prices[usageType];
      return price ? [[usageType, price.mul(units).toNumber()]] : [];
    }),
  );
  if (costs.total !== undefined) return costs.total;
  const itemizedCosts = Object.entries(costs).filter(
    ([usageType]) => usageType !== "total",
  );
  return itemizedCosts.length > 0
    ? itemizedCosts.reduce((total, [, cost]) => total + cost, 0)
    : null;
}

async function testCodeEvaluator(params: {
  orgId: string;
  projectId: string;
  evaluatorId: string;
  definition: Extract<NormalizedEvaluatorDefinition, { type: "CODE" }>;
  variables: ExtractedVariable[];
  hasExperimentContext: boolean;
  executionMetadata: Record<string, string>;
  evaluationContext: ReturnType<
    typeof buildEvalExecutionData
  >["evaluationContext"];
}) {
  const dispatcher = resolveConfiguredCodeEvalDispatcher();
  if (!dispatcher) {
    return {
      success: false as const,
      error: "Code eval dispatcher is not configured",
    };
  }

  const executionTraceId = createW3CTraceId();
  return runCodeBasedEvaluationDispatch({
    dispatcher,
    organizationId: params.orgId,
    projectId: params.projectId,
    executionTraceId,
    jobExecutionId: executionTraceId,
    evaluator: { id: params.evaluatorId },
    version: params.definition,
    extractedVariables: params.variables,
    hasExperimentContext: params.hasExperimentContext,
    traceName: "Test evaluator",
    metadata: params.executionMetadata,
    evaluationContext: params.evaluationContext,
  });
}
