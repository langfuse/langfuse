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

export type EvalVariableDiagnosticStatus = "resolved" | "empty" | "missing";

export type EvalVariableDiagnostic = {
  variable: string;
  status: EvalVariableDiagnosticStatus;
  valueType?: string;
};

export type EvalVariableDiagnostics = {
  variables: EvalVariableDiagnostic[];
  resolvedVariables: string[];
  emptyVariables: string[];
  missingVariables: string[];
  duplicateVariables: string[];
  coverageRatio: number;
};

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

export function buildEvalVariableDiagnostics(params: {
  templateVariables: string[];
  extractedVariables: ExtractedVariable[];
}): EvalVariableDiagnostics {
  const extractedByName = new Map<string, ExtractedVariable>();
  const seenVariables = new Set<string>();
  const duplicateVariables = new Set<string>();

  for (const variable of params.extractedVariables) {
    if (seenVariables.has(variable.var)) {
      duplicateVariables.add(variable.var);
      continue;
    }

    seenVariables.add(variable.var);
    extractedByName.set(variable.var, variable);
  }

  const diagnostics = params.templateVariables.map((variable) => {
    const extractedVariable = extractedByName.get(variable);
    if (!extractedVariable) {
      return { variable, status: "missing" as const };
    }

    const stringifiedValue = parseUnknownToString(extractedVariable.value);
    if (stringifiedValue.trim() === "") {
      return {
        variable,
        status: "empty" as const,
        valueType: getVariableValueType(extractedVariable.value),
      };
    }

    return {
      variable,
      status: "resolved" as const,
      valueType: getVariableValueType(extractedVariable.value),
    };
  });

  const resolvedVariables = diagnostics
    .filter((diagnostic) => diagnostic.status === "resolved")
    .map((diagnostic) => diagnostic.variable);
  const emptyVariables = diagnostics
    .filter((diagnostic) => diagnostic.status === "empty")
    .map((diagnostic) => diagnostic.variable);
  const missingVariables = diagnostics
    .filter((diagnostic) => diagnostic.status === "missing")
    .map((diagnostic) => diagnostic.variable);

  return {
    variables: diagnostics,
    resolvedVariables,
    emptyVariables,
    missingVariables,
    duplicateVariables: [...duplicateVariables],
    coverageRatio:
      params.templateVariables.length === 0
        ? 1
        : resolvedVariables.length / params.templateVariables.length,
  };
}

export function buildEvalVariableDiagnosticsMetadata(
  diagnostics: EvalVariableDiagnostics,
): Record<string, string> {
  return {
    eval_variable_resolved_count:
      diagnostics.resolvedVariables.length.toString(),
    eval_variable_empty_count: diagnostics.emptyVariables.length.toString(),
    eval_variable_missing_count: diagnostics.missingVariables.length.toString(),
    eval_variable_duplicate_count:
      diagnostics.duplicateVariables.length.toString(),
    eval_variable_coverage_ratio: diagnostics.coverageRatio.toFixed(3),
    ...(diagnostics.emptyVariables.length > 0
      ? { eval_variable_empty_names: diagnostics.emptyVariables.join(",") }
      : {}),
    ...(diagnostics.missingVariables.length > 0
      ? { eval_variable_missing_names: diagnostics.missingVariables.join(",") }
      : {}),
    ...(diagnostics.duplicateVariables.length > 0
      ? {
          eval_variable_duplicate_names:
            diagnostics.duplicateVariables.join(","),
        }
      : {}),
  };
}

export function buildEvalVariableDiagnosticsSpanAttributes(
  diagnostics: EvalVariableDiagnostics,
): Record<string, string | number | string[]> {
  return {
    "eval.variable.resolved_count": diagnostics.resolvedVariables.length,
    "eval.variable.empty_count": diagnostics.emptyVariables.length,
    "eval.variable.missing_count": diagnostics.missingVariables.length,
    "eval.variable.duplicate_count": diagnostics.duplicateVariables.length,
    "eval.variable.coverage_ratio": diagnostics.coverageRatio,
    ...(diagnostics.emptyVariables.length > 0
      ? { "eval.variable.empty_names": diagnostics.emptyVariables }
      : {}),
    ...(diagnostics.missingVariables.length > 0
      ? { "eval.variable.missing_names": diagnostics.missingVariables }
      : {}),
    ...(diagnostics.duplicateVariables.length > 0
      ? { "eval.variable.duplicate_names": diagnostics.duplicateVariables }
      : {}),
  };
}

function getVariableValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
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
