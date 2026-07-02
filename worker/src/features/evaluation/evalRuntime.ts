import { createHash } from "crypto";
import stableStringify from "fast-json-stable-stringify";
import {
  ChatMessageRole,
  ChatMessageType,
  parseUnknownToString,
} from "@langfuse/shared";
import { type ExtractedVariable } from "@langfuse/shared/src/server";
import { compileTemplateString } from "../utils";

export interface CompileEvalPromptParams {
  templatePrompt: string;
  variables: ExtractedVariable[];
}

function sha256Base64Url(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export function buildEvalPromptCacheKey(params: {
  projectId: string;
  templateId: string;
  templateVersion: number;
  templatePrompt: string;
  provider: string;
  model: string;
}): string {
  // Versioned cache bucket for requests that share the same reusable evaluator
  // prompt prefix on the same model endpoint. Per-run variables and output
  // definitions are intentionally excluded to avoid fragmenting prompt caches.
  const payload = {
    projectId: params.projectId,
    templateId: params.templateId,
    templateVersion: params.templateVersion,
    templatePromptHash: sha256Base64Url(params.templatePrompt),
    provider: params.provider,
    model: params.model,
  };

  return `lf-eval-v1-${sha256Base64Url(stableStringify(payload))}`;
}

export function compileEvalPrompt(params: CompileEvalPromptParams): string {
  // Stringify extracted values here (LLM-judge's consumption boundary) so
  // the upstream extractor can preserve original shapes for code-eval and
  // template substitution still gets a flat string per variable.
  const variableMap = Object.fromEntries(
    params.variables.map(({ var: key, value }) => [
      key,
      parseUnknownToString(value),
    ]),
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
