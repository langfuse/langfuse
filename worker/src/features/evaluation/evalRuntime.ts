import { ChatMessageRole, ChatMessageType } from "@langfuse/shared";
import { compileTemplateString } from "../utils";
import { ExtractedVariable } from "./observationEval/extractObservationVariables";

export interface CompileEvalPromptParams {
  templatePrompt: string;
  variables: ExtractedVariable[];
}

export function compileEvalPrompt(params: CompileEvalPromptParams): string {
  const variableMap = Object.fromEntries(
    params.variables.map(({ var: key, value }) => [key, value]),
  );

  return compileTemplateString(params.templatePrompt, variableMap);
}

export function buildEvalExecutionMetadata(params: {
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
