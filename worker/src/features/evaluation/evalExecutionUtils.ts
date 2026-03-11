import { z } from "zod/v4";
import { z as zodV3 } from "zod/v3";
import {
  ChatMessageRole,
  EvalTemplateOutputKind,
  EvalTemplateOutputSchema as SharedEvalTemplateOutputSchema,
  normalizeEvalTemplateOutputSchema,
  ScoreSourceEnum,
} from "@langfuse/shared";
import {
  ChatMessageType,
  eventTypes,
  ScoreEventType,
} from "@langfuse/shared/src/server";
import { compileTemplateString } from "../utils";
import { ExtractedVariable } from "./observationEval/extractObservationVariables";

export const evalTemplateOutputSchema = SharedEvalTemplateOutputSchema;

export type EvalTemplateOutputSchema = z.infer<typeof evalTemplateOutputSchema>;

/**
 * Parameters for compiling an eval prompt.
 */
export interface CompileEvalPromptParams {
  templatePrompt: string;
  variables: ExtractedVariable[];
}

/**
 * Compiles an eval prompt template by substituting variables.
 *
 * @param params - The template prompt and variables to substitute
 * @returns The compiled prompt string
 */
export function compileEvalPrompt(params: CompileEvalPromptParams): string {
  const variableMap = Object.fromEntries(
    params.variables.map(({ var: key, value }) => [key, value]),
  );

  return compileTemplateString(params.templatePrompt, variableMap);
}

/**
 * Builds a Zod v3 schema for validating LLM structured output responses.
 *
 * @param outputSchema - The parsed output schema from the eval template
 * @returns A Zod v3 schema for validating LLM responses
 */
export function buildEvalResponseValidationSchema(
  outputSchema: EvalTemplateOutputSchema,
) {
  const normalizedSchema = normalizeEvalTemplateOutputSchema(outputSchema);

  if (normalizedSchema.kind === EvalTemplateOutputKind.CATEGORICAL) {
    const [firstOption, ...restOptions] = normalizedSchema.options.map(
      (option) => option.value,
    );

    if (!firstOption) {
      throw new Error(
        "Categorical eval output schema requires at least one option",
      );
    }

    return zodV3.object({
      reasoning: zodV3.string().describe(normalizedSchema.reasoningDescription),
      score: zodV3
        .enum([firstOption, ...restOptions])
        .describe(normalizedSchema.scoreDescription),
    });
  }

  return zodV3.object({
    reasoning: zodV3.string().describe(normalizedSchema.reasoningDescription),
    score: zodV3.number().describe(normalizedSchema.scoreDescription),
  });
}

/**
 * Builds execution metadata for tracking and debugging.
 *
 * @param params - Job execution identifiers
 * @returns Record of non-null metadata entries
 */
export function buildExecutionMetadata(params: {
  jobExecutionId: string;
  jobConfigurationId: string;
  targetTraceId?: string | null;
  targetObservationId?: string | null;
  targetDatasetItemId?: string | null;
}): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      job_execution_id: params.jobExecutionId,
      job_configuration_id: params.jobConfigurationId,
      target_trace_id: params.targetTraceId,
      target_observation_id: params.targetObservationId,
      target_dataset_item_id: params.targetDatasetItemId,
    }).filter(([, v]) => v != null),
  ) as Record<string, string>;
}

/**
 * Builds the LLM chat messages for eval execution.
 *
 * @param prompt - The compiled prompt string
 * @returns Array of chat messages for the LLM call
 */
export function buildEvalMessages(prompt: string) {
  return [
    {
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: prompt,
    } as const,
  ];
}

/**
 * Parameters for building a score event.
 */
type BuildScoreEventBase = {
  eventId: string;
  scoreId: string;
  traceId: string | null;
  observationId: string | null;
  scoreName: string;
  reasoning: string;
  environment: string;
  executionTraceId: string;
  metadata: Record<string, string>;
};

export type BuildScoreEventParams = BuildScoreEventBase &
  (
    | {
        dataType: "NUMERIC";
        score: number;
      }
    | {
        dataType: "CATEGORICAL";
        score: string;
      }
  );

/**
 * Builds a score event for S3 upload and ingestion queue.
 *
 * @param params - Score event parameters
 * @returns A score event ready for persistence
 */
export function buildScoreEvent(params: BuildScoreEventParams): ScoreEventType {
  const bodyBase = {
    id: params.scoreId,
    traceId: params.traceId,
    observationId: params.observationId,
    name: params.scoreName,
    comment: params.reasoning,
    source: ScoreSourceEnum.EVAL,
    environment: params.environment,
    executionTraceId: params.executionTraceId,
    metadata: params.metadata,
  };

  if (params.dataType === "CATEGORICAL") {
    return {
      id: params.eventId,
      timestamp: new Date().toISOString(),
      type: eventTypes.SCORE_CREATE,
      body: {
        ...bodyBase,
        value: params.score,
        dataType: "CATEGORICAL",
      },
    };
  }

  return {
    id: params.eventId,
    timestamp: new Date().toISOString(),
    type: eventTypes.SCORE_CREATE,
    body: {
      ...bodyBase,
      value: params.score,
      dataType: "NUMERIC",
    },
  };
}

/**
 * Extracts the environment from extracted variables.
 * The environment is included on the first variable that has it set.
 *
 * @param variables - Array of extracted variables
 * @returns The environment string or undefined
 */
export function getEnvironmentFromVariables(
  variables: ExtractedVariable[],
): string | undefined {
  return variables.find((v) => v.environment)?.environment;
}

/**
 * Parameters for validating LLM response.
 */
export interface ValidateLLMResponseParams {
  response: unknown;
  schema: ReturnType<typeof buildEvalResponseValidationSchema>;
}

/**
 * Validates and parses the LLM response against the score schema.
 *
 * @param params - The raw LLM response and schema to validate against
 * @returns Parsed response with score and reasoning, or error
 */
export function validateLLMResponse(
  params: ValidateLLMResponseParams,
):
  | { success: true; data: { score: number | string; reasoning: string } }
  | { success: false; error: string } {
  const result = params.schema.safeParse(params.response);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error.message };
}
