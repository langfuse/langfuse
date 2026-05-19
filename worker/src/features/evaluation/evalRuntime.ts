import {
  ChatMessageRole,
  ChatMessageType,
  deepParseJson,
} from "@langfuse/shared";
import { compileTemplateString } from "../utils";
import { logger } from "@langfuse/shared/src/server";
import { type TemplateFormat } from "@langfuse/shared/src/server";
import { ExtractedVariable } from "./observationEval/extractObservationVariables";

export interface CompileEvalPromptParams {
  templatePrompt: string;
  variables: ExtractedVariable[];
  templateFormat?: TemplateFormat;
}

export function compileEvalPrompt(params: CompileEvalPromptParams): string {
  const format = params.templateFormat ?? "default";

  const variableMap = Object.fromEntries(
    params.variables.map(({ var: key, value }) => {
      // For Jinja2 format: re-parse JSON strings so arrays/objects are passed
      // as structured data, enabling {% for item in list %} loops.
      if (format === "jinja2" && typeof value === "string") {
        try {
          const parsed = deepParseJson(value);
          return [key, parsed];
        } catch {
          return [key, value];
        }
      }
      return [key, value];
    }),
  );

  const result = compileTemplateString(
    params.templatePrompt,
    variableMap,
    format,
  );

  if (format === "jinja2") {
    // compileTemplateString logs warnings internally; surface undefined-variable
    // issues here for observability in eval job logs.
    logger.debug("compileEvalPrompt completed", {
      format,
      variableCount: params.variables.length,
    });
  }

  return result;
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
