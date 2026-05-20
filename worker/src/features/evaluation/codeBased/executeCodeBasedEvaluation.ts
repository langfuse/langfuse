import { randomUUID } from "crypto";
import { type JobConfiguration, type JobExecution } from "@prisma/client";
import { stringifyValue, type EvalTemplateCodeBased } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  instrumentAsync,
  INTERNAL_TRACE_EVENT_SOURCE,
  LangfuseInternalTraceEnvironment,
  logger,
  resolveConfiguredCodeEvalDispatcher,
  type CodeEvalScore,
  type CodeEvalScoreWithName,
  type CodeEvalPayload,
} from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../../../errors/UnrecoverableError";
import { createW3CTraceId } from "../../utils";
import { createInternalEventsWriter } from "../../internal-tracing/createInternalEventsWriter";
import { type EvalExecutionResult } from "../evalCompletion";
import { type EvalExecutionDeps } from "../evalExecutionDeps";
import { type ExtractedVariable } from "../observationEval/extractObservationVariables";

const CODE_EVAL_SCOPE_ENVIRONMENT = "code-based-eval";

export async function executeCodeBasedEvaluation(params: {
  projectId: string;
  jobExecutionId: string;
  job: JobExecution;
  config: JobConfiguration;
  template: EvalTemplateCodeBased;
  extractedVariables: ExtractedVariable[];
  environment: string;
  metadata: Record<string, string>;
  // Unused; present for ObservationEvalExecutor interface symmetry.
  deps?: EvalExecutionDeps;
}): Promise<EvalExecutionResult> {
  return instrumentAsync(
    { name: "eval.execute-code-based-eval" },
    async (span) => {
      const dispatcher = resolveConfiguredCodeEvalDispatcher();

      if (!dispatcher) {
        throw new UnrecoverableError("Code eval dispatcher is not configured");
      }

      const project = await prisma.project.findUnique({
        where: { id: params.projectId },
        select: { orgId: true },
      });

      if (!project) {
        throw new UnrecoverableError(
          `Project ${params.projectId} not found for code eval execution`,
        );
      }

      const executionTraceId = createW3CTraceId(params.jobExecutionId);
      const primaryScoreId = randomUUID();
      const executionMetadata = {
        ...params.metadata,
        dispatcher_name: dispatcher.name,
        code_eval_runtime: params.template.sourceCodeLanguage,
      };

      span.setAttribute("langfuse.project.id", params.projectId);
      span.setAttribute("eval.job_execution.id", params.jobExecutionId);
      span.setAttribute("eval.job_configuration.id", params.config.id);
      span.setAttribute("eval.template.id", params.template.id);
      span.setAttribute("eval.template.version", params.template.version);
      span.setAttribute("eval.dispatcher.name", dispatcher.name);
      span.setAttribute(
        "eval.runner.language",
        params.template.sourceCodeLanguage,
      );

      logger.debug(
        `Executing code-based evaluation for job ${params.jobExecutionId} in project ${params.projectId}`,
      );

      const payload = buildCodeEvalPayload(params.extractedVariables);
      const traceStartTime = new Date();
      const traceName = `Execute evaluator: ${params.template.name}`;
      let dispatchResult: { scores: CodeEvalScore[] } | undefined;
      let scores: CodeEvalScoreWithName[];

      try {
        dispatchResult = await dispatcher.dispatch({
          scope: {
            organizationId: project.orgId,
            projectId: params.projectId,
            evaluatorId: params.template.id,
            environment: CODE_EVAL_SCOPE_ENVIRONMENT,
          },
          runtime: { language: params.template.sourceCodeLanguage },
          execution: { jobExecutionId: params.jobExecutionId },
          code: { source: params.template.sourceCode },
          payload,
        });

        scores = normalizeCodeEvalScores({
          scores: dispatchResult.scores,
          defaultScoreName: params.config.scoreName,
        });
      } catch (error) {
        const errorDetails = serializeCodeEvalError(error);

        try {
          await writeCodeEvalTrace({
            projectId: params.projectId,
            executionTraceId,
            traceStartTime,
            traceName,
            payload,
            output: {
              ...(dispatchResult ? { result: dispatchResult } : {}),
              error: errorDetails,
            },
            metadata: {
              ...executionMetadata,
              score_id: primaryScoreId,
              error_name: errorDetails.name,
              error_message: errorDetails.message,
              ...(errorDetails.code ? { error_code: errorDetails.code } : {}),
              ...(typeof errorDetails.retryable === "boolean"
                ? { error_retryable: errorDetails.retryable }
                : {}),
            },
            level: "ERROR",
            statusMessage: `Code eval execution failed: ${errorDetails.message}`,
          });
        } catch (traceError) {
          logger.warn(
            "Failed to write internal trace for failed code eval execution",
            {
              projectId: params.projectId,
              executionTraceId,
              error:
                traceError instanceof Error
                  ? traceError.message
                  : String(traceError),
            },
          );
        }

        throw error;
      }

      // LLM-as-judge gets this trace from fetchLLMCompletion's traceSinkParams;
      // the code-eval dispatcher returns no trace data, so synthesize a SPAN.
      await writeCodeEvalTrace({
        projectId: params.projectId,
        executionTraceId,
        traceStartTime,
        traceName,
        payload,
        output: dispatchResult,
        metadata: {
          ...executionMetadata,
          score_id: primaryScoreId,
        },
      });

      span.setAttribute("eval.result.count", scores.length);
      span.setAttribute("eval.score.id", primaryScoreId);

      return {
        scores,
        primaryScoreId,
        executionTraceId,
        metadata: executionMetadata,
      };
    },
  );
}

// The frontend maps user-facing template variables to a fixed, known set of
// payload field names; we only need to look each one up once. Values are
// already typed (the upstream extractor preserves the original shape), so
// no per-field parsing is needed here.
function buildCodeEvalPayload(
  extractedVariables: ExtractedVariable[],
): CodeEvalPayload {
  const byName = new Map(extractedVariables.map((v) => [v.var, v.value]));
  const hasExperiment =
    byName.has("experimentExpectedOutput") ||
    byName.has("experimentItemMetadata");

  const payload: CodeEvalPayload = {
    observation: {
      input: byName.get("input") ?? null,
      output: byName.get("output") ?? null,
      metadata: byName.get("observationMetadata") ?? null,
    },
  };

  if (hasExperiment) {
    payload.experiment = {
      expectedOutput: byName.get("experimentExpectedOutput") ?? null,
      itemMetadata: byName.get("experimentItemMetadata") ?? null,
    };
  }

  return payload;
}

async function writeCodeEvalTrace(params: {
  projectId: string;
  executionTraceId: string;
  traceStartTime: Date;
  traceName: string;
  payload: CodeEvalPayload;
  output: unknown;
  metadata: Record<string, unknown>;
  level?: string;
  statusMessage?: string;
}) {
  await createInternalEventsWriter().write({
    rootSpanId: params.executionTraceId,
    eventInputs: [
      {
        projectId: params.projectId,
        traceId: params.executionTraceId,
        spanId: params.executionTraceId,
        startTimeISO: params.traceStartTime.toISOString(),
        endTimeISO: new Date().toISOString(),
        name: params.traceName,
        traceName: params.traceName,
        type: "SPAN",
        environment: LangfuseInternalTraceEnvironment.CodeEval,
        ...(params.level ? { level: params.level } : {}),
        ...(params.statusMessage
          ? { statusMessage: params.statusMessage }
          : {}),
        input: stringifyValue(params.payload),
        output: stringifyValue(params.output),
        metadata: params.metadata,
        source: INTERNAL_TRACE_EVENT_SOURCE,
      },
    ],
  });
}

function serializeCodeEvalError(error: unknown): {
  name: string;
  message: string;
  code?: string;
  retryable?: boolean;
} {
  const base =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "Error", message: String(error) };

  if (!error || typeof error !== "object") return base;

  const errorRecord = error as Record<string, unknown>;

  return {
    ...base,
    ...(typeof errorRecord.code === "string" ? { code: errorRecord.code } : {}),
    ...(typeof errorRecord.retryable === "boolean"
      ? { retryable: errorRecord.retryable }
      : {}),
  };
}

function normalizeCodeEvalScores(params: {
  scores: CodeEvalScore[];
  defaultScoreName: string;
}): CodeEvalScoreWithName[] {
  return params.scores.map((score) =>
    score.name
      ? (score as CodeEvalScoreWithName)
      : { ...score, name: params.defaultScoreName },
  );
}
