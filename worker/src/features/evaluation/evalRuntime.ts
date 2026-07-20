import {
  ChatMessageRole,
  ChatMessageType,
  parseUnknownToPromptString,
} from "@langfuse/shared";
import { type ExtractedVariable } from "@langfuse/shared/src/server";
import { compileTemplateString } from "../utils";

export interface CompileEvalPromptParams {
  templatePrompt: string;
  variables: ExtractedVariable[];
}

export function compileEvalPrompt(params: CompileEvalPromptParams): string {
  // Stringify extracted values here (LLM-judge's consumption boundary) so
  // the upstream extractor can preserve original shapes for code-eval and
  // template substitution still gets a flat string per variable. Encoded
  // JSON strings (e.g. a full-value mapping of a stringified input) are
  // decoded so the judge sees clean JSON.
  const variableMap = Object.fromEntries(
    params.variables.map(({ var: key, value }) => [
      key,
      parseUnknownToPromptString(value),
    ]),
  );

  return compileTemplateString(params.templatePrompt, variableMap);
}

export function buildEvalExecutionMetadata(params: {
  jobExecutionId: string;
  jobConfigurationId: string;
  runScopeId?: string | null;
  targetTraceId?: string | null;
  targetObservationId?: string | null;
  targetDatasetItemId?: string | null;
}): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      job_execution_id: params.jobExecutionId,
      job_configuration_id: params.jobConfigurationId,
      run_scope_id: params.runScopeId,
      target_trace_id: params.targetTraceId,
      target_observation_id: params.targetObservationId,
      target_dataset_item_id: params.targetDatasetItemId,
    }).filter(([, value]) => value != null),
  ) as Record<string, string>;
}

export function buildEvalMessages(prompt: string) {
  return [
    {
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: prompt,
    } as const,
  ];
}

export function getEnvironmentFromVariables(
  variables: ExtractedVariable[],
): string | undefined {
  return variables.find((variable) => variable.environment)?.environment;
}
