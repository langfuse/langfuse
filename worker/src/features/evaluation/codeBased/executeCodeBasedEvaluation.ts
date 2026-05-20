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
      const dispatchResult = await dispatcher.dispatch({
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

      const scores = normalizeCodeEvalScores({
        scores: dispatchResult.scores,
        defaultScoreName: params.config.scoreName,
      });

      // LLM-as-judge gets this trace from fetchLLMCompletion's traceSinkParams;
      // the code-eval dispatcher returns no trace data, so synthesize a SPAN.
      const traceName = `Execute evaluator: ${params.template.name}`;
      await createInternalEventsWriter().write({
        rootSpanId: executionTraceId,
        eventInputs: [
          {
            projectId: params.projectId,
            traceId: executionTraceId,
            spanId: executionTraceId,
            startTimeISO: traceStartTime.toISOString(),
            endTimeISO: new Date().toISOString(),
            name: traceName,
            traceName,
            type: "SPAN",
            environment: LangfuseInternalTraceEnvironment.CodeEval,
            input: stringifyValue(payload),
            output: stringifyValue(dispatchResult),
            metadata: {
              ...executionMetadata,
              score_id: primaryScoreId,
            },
            source: INTERNAL_TRACE_EVENT_SOURCE,
          },
        ],
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
  return {
    input: byName.get("input") ?? null,
    output: byName.get("output") ?? null,
    observationMetadata: byName.get("observationMetadata") ?? null,
    experimentExpectedOutput: byName.get("experimentExpectedOutput") ?? null,
    experimentItemMetadata: byName.get("experimentItemMetadata") ?? null,
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
