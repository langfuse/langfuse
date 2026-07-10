import { type z } from "zod";
import {
  ChatMessageRole,
  ChatMessageType,
  availableTraceEvalVariables,
  compilePersistedEvalOutputDefinition,
  extractValueFromObject,
  parseUnknownToString,
  PersistedEvalOutputDefinitionSchema,
  validateEvalOutputResult,
  type variableMapping,
} from "@langfuse/shared";
import {
  DefaultEvalModelService,
  fetchLLMCompletion,
  getObservationForTraceIdByName,
  getTraceById,
  logger,
} from "@langfuse/shared/src/server";

// Prototype fallback for templates without an output definition (create from
// scratch). Mirrors the legacy managed-evaluator shape.
export const DEFAULT_OUTPUT_DEFINITION = {
  score:
    "Score between 0 and 1. Score 0 if false or negative and 1 if true or positive",
  reasoning: "One sentence reasoning for the score",
};

type VariableMapping = z.infer<typeof variableMapping>;

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
    }
  | {
      success: false;
      error: string;
      interpolatedPrompt?: string;
      extractedVariables?: { var: string; value: string }[];
    };

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

async function extractTraceVariables(params: {
  projectId: string;
  traceId: string;
  traceTimestamp?: Date;
  variables: string[];
  mapping: VariableMapping[];
}): Promise<{ var: string; value: string }[]> {
  const { projectId, traceId, traceTimestamp, variables, mapping } = params;

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const trace = await getTraceById({
    traceId,
    projectId,
    timestamp: traceTimestamp,
  });

  if (!trace) {
    throw new Error(`Trace ${traceId} not found`);
  }

  const observationCache = new Map<string, Record<string, unknown> | null>();
  const results: { var: string; value: string }[] = [];

  for (const variable of variables) {
    const varMapping = mapping.find((m) => m.templateVariable === variable);
    if (!varMapping) {
      results.push({ var: variable, value: "" });
      continue;
    }

    let sourceRow: Record<string, unknown> | null = null;
    if (varMapping.langfuseObject === "trace") {
      sourceRow = trace as unknown as Record<string, unknown>;
    } else if (varMapping.objectName) {
      const cacheKey = varMapping.objectName;
      if (!observationCache.has(cacheKey)) {
        const observations = await getObservationForTraceIdByName({
          traceId,
          projectId,
          name: varMapping.objectName,
          timestamp: traceTimestamp,
          fetchWithInputOutput: true,
        });
        observationCache.set(
          cacheKey,
          (observations.shift() as unknown as Record<string, unknown>) ?? null,
        );
      }
      sourceRow = observationCache.get(cacheKey) ?? null;
    }

    if (!sourceRow) {
      results.push({ var: variable, value: "" });
      continue;
    }

    const catalog = availableTraceEvalVariables.find(
      (o) => o.id === varMapping.langfuseObject,
    );
    const column = catalog?.availableColumns.find(
      (col) => col.id === varMapping.selectedColumnId,
    );
    if (!column) {
      results.push({ var: variable, value: "" });
      continue;
    }

    const snakeToCamel = (s: string) =>
      s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const rawColumnValue =
      sourceRow[varMapping.selectedColumnId] ??
      sourceRow[snakeToCamel(varMapping.selectedColumnId)];

    const { value } = extractValueFromObject(
      { [varMapping.selectedColumnId]: rawColumnValue },
      varMapping.selectedColumnId,
      varMapping.jsonSelector ?? undefined,
    );

    results.push({ var: variable, value: parseUnknownToString(value) });
  }

  return results;
}

export async function runLlmJudgeTest(params: {
  projectId: string;
  prompt: string;
  provider?: string | null;
  model?: string | null;
  modelParams?: unknown;
  outputDefinition?: unknown;
  mapping: VariableMapping[];
  traceId: string;
  traceTimestamp?: Date;
}): Promise<LlmJudgeTestRunResult> {
  const variables = Array.from(
    new Set(
      [...params.prompt.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((m) => m[1]),
    ),
  );

  let extractedVariables: { var: string; value: string }[];
  try {
    extractedVariables = await extractTraceVariables({
      projectId: params.projectId,
      traceId: params.traceId,
      traceTimestamp: params.traceTimestamp,
      variables,
      mapping: params.mapping,
    });
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
      };
    }

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
    };
  } catch (error) {
    logger.info("LLM judge test run failed", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      interpolatedPrompt,
      extractedVariables,
    };
  }
}
