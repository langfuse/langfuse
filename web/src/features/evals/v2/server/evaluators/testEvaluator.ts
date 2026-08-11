import { randomUUID } from "node:crypto";
import {
  CODE_EVAL_TEMPLATE_VARIABLES,
  observationVariableMappingList,
} from "@langfuse/shared";
import {
  buildEvalExecutionMetadata,
  createW3CTraceId,
  DefaultEvalModelService,
  createLLMOutput,
  executeLlmEvaluator,
  extractObservationVariables,
  generateLLMText,
  LangfuseInternalTraceEnvironment,
  mapLegacyLLMCompletionParams,
  resolveConfiguredCodeEvalDispatcher,
  runCodeBasedEvaluationDispatch,
  type ExtractedVariable,
} from "@langfuse/shared/src/server";
import { getObservationForEvalById } from "@/src/features/evals/server/getObservationForEvalById";
import type { EvaluatorDefinition } from "./evaluatorTypes";

export async function testEvaluator(params: {
  orgId: string;
  projectId: string;
  evaluatorId?: string;
  definition: EvaluatorDefinition;
  observationId: string;
  traceId: string;
  startTime: Date;
  shouldReadFromObservationsTable?: boolean;
}) {
  const observation = await getObservationForEvalById({
    projectId: params.projectId,
    id: params.observationId,
    traceId: params.traceId,
    startTime: params.startTime,
    shouldReadFromObservationsTable: params.shouldReadFromObservationsTable,
  });
  const variableMapping =
    params.definition.type === "CODE"
      ? CODE_EVAL_TEMPLATE_VARIABLES.map((variable) => ({
          templateVariable: variable,
          selectedColumnId: variable,
          jsonSelector: null,
        }))
      : observationVariableMappingList.parse(params.definition.variableMapping);
  const variables = extractObservationVariables({
    observation,
    variableMapping,
  });
  const metadata = buildEvalExecutionMetadata({
    type: "TEST",
    evaluatorId: params.evaluatorId,
    targetTraceId: params.traceId,
    targetObservationId: params.observationId,
  });

  if (params.definition.type === "CODE") {
    return testCodeEvaluator({
      orgId: params.orgId,
      projectId: params.projectId,
      evaluatorId: params.evaluatorId,
      definition: params.definition,
      variables,
      metadata,
    });
  }

  return testLlmEvaluator({
    projectId: params.projectId,
    evaluatorId: params.evaluatorId,
    definition: params.definition,
    variables,
    metadata,
  });
}

async function testLlmEvaluator(params: {
  projectId: string;
  evaluatorId?: string;
  definition: Extract<EvaluatorDefinition, { type: "LLM_AS_JUDGE" }>;
  variables: ExtractedVariable[];
  metadata: ReturnType<typeof buildEvalExecutionMetadata>;
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
  try {
    const execution = await executeLlmEvaluator({
      templatePrompt: params.definition.prompt,
      variables: params.variables,
      outputDefinition: params.definition.outputDefinition,
      callLlm: async ({
        messages,
        compiledOutputDefinition,
        interpolatedPrompt: prompt,
      }) => {
        interpolatedPrompt = prompt;
        const result = await generateLLMText({
          ...mapLegacyLLMCompletionParams({
            connection: modelConfig.config.apiKey,
            messages,
            modelParams: {
              provider: modelConfig.config.provider,
              model: modelConfig.config.model,
              adapter: modelConfig.config.apiKey.adapter,
              ...modelConfig.config.modelParams,
            },
          }),
          output: createLLMOutput(compiledOutputDefinition.outputResultSchema),
          maxRetries: 1,
          trace: {
            targetProjectId: params.projectId,
            traceId: executionTraceId,
            traceName: "Test evaluator",
            environment: LangfuseInternalTraceEnvironment.LLMJudge,
            metadata: params.metadata,
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

async function testCodeEvaluator(params: {
  orgId: string;
  projectId: string;
  evaluatorId?: string;
  definition: Extract<EvaluatorDefinition, { type: "CODE" }>;
  variables: ExtractedVariable[];
  metadata: ReturnType<typeof buildEvalExecutionMetadata>;
}) {
  const dispatcher = resolveConfiguredCodeEvalDispatcher();
  if (!dispatcher) {
    return {
      success: false as const,
      error: "Code eval dispatcher is not configured",
    };
  }

  const evaluatorId = params.evaluatorId ?? randomUUID();
  const executionTraceId = createW3CTraceId();

  return runCodeBasedEvaluationDispatch({
    dispatcher,
    organizationId: params.orgId,
    projectId: params.projectId,
    executionTraceId,
    jobExecutionId: executionTraceId,
    evaluator: { id: evaluatorId },
    version: params.definition,
    extractedVariables: params.variables,
    traceName: "Test evaluator",
    metadata: params.metadata,
  });
}
