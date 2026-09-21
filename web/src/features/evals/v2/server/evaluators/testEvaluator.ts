import {
  getCodeEvalVariableMapping,
  getDecisionModelVariableMapping,
  observationVariableMappingList,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import {
  buildEvalExecutionData,
  compileLangfuseMediaMessages,
  createTypeSafeDecisionModelClient,
  createW3CTraceId,
  DefaultEvalModelService,
  createLLMOutput,
  executeDecisionModelEvaluator,
  executeLlmEvaluator,
  extractObservationVariables,
  findModel,
  generateLLMText,
  isDecisionModelAdapter,
  LangfuseInternalTraceEnvironment,
  mapLegacyLLMCompletionParams,
  matchPricingTier,
  resolveConfiguredCodeEvalDispatcher,
  runCodeBasedEvaluationDispatch,
  type ExtractedVariable,
} from "@langfuse/shared/src/server";
import { getObservationForEvalById } from "@/src/features/evals/server/getObservationForEvalById";
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
  let variableMapping;
  if (params.definition.type === "CODE") {
    variableMapping = getCodeEvalVariableMapping();
  } else if (params.definition.type === "DECISION_MODEL") {
    variableMapping = getDecisionModelVariableMapping();
  } else {
    const llmVariableMapping = params.definition.variableMapping ?? [];
    assertCompleteEvaluatorVariableMapping({
      promptVariables: extractEvaluatorPromptVariables(
        params.definition.promptMessages,
      ),
      variableMapping: llmVariableMapping,
    });
    variableMapping = observationVariableMappingList.parse(llmVariableMapping);
  }
  const variables = extractObservationVariables({
    observation,
    variableMapping,
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
    ...executionData,
  });

  return { ...result, durationMs: Date.now() - startedAt };
}

async function runEvaluatorTest(params: {
  orgId: string;
  projectId: string;
  evaluatorId: string;
  definition: NormalizedEvaluatorDefinition;
  variables: ExtractedVariable[];
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

/**
 * Decision models return no rationale, so the "prompt" shown to the user is
 * the exact request: the state built from the observation and the question.
 */
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
  if (!isDecisionModelAdapter(modelConfig.config.apiKey.adapter)) {
    return {
      success: false as const,
      error: `Connection "${params.definition.provider}" is not a decision-model connection.`,
    };
  }

  const executionTraceId = createW3CTraceId();
  let interpolatedPrompt: string | undefined;
  try {
    const client = createTypeSafeDecisionModelClient({
      apiKey: decrypt(modelConfig.config.apiKey.secretKey),
      model: modelConfig.config.model,
    });
    const execution = await executeDecisionModelEvaluator({
      instructions: params.definition.prompt,
      variables: params.variables,
      outputDefinition: params.definition.outputDefinition,
      client: {
        evaluateChoice: (request) => {
          interpolatedPrompt = JSON.stringify(request, null, 2);
          return client.evaluateChoice(request);
        },
      },
    });

    return {
      success: true as const,
      result: execution.output,
      interpolatedPrompt,
      model: execution.evaluation.model,
      provider: modelConfig.config.provider,
      executionTraceId,
      estimatedCostUsd: null,
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
        const modelParams = {
          provider: modelConfig.config.provider,
          model: modelConfig.config.model,
          adapter: modelConfig.config.apiKey.adapter,
          ...modelConfig.config.modelParams,
        };
        const llmParams = mapLegacyLLMCompletionParams({
          connection: modelConfig.config.apiKey,
          messages,
          modelParams,
        });
        const { providerMessages, traceMessages } =
          await compileLangfuseMediaMessages({
            projectId: params.projectId,
            messages,
            adapter: modelConfig.config.apiKey.adapter,
          });
        const result = await generateLLMText({
          ...llmParams,
          messages: providerMessages,
          traceInput: traceMessages,
          output: createLLMOutput(compiledOutputDefinition.outputResultSchema),
          maxRetries: 1,
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
    traceName: "Test evaluator",
    metadata: params.executionMetadata,
    evaluationContext: params.evaluationContext,
  });
}
