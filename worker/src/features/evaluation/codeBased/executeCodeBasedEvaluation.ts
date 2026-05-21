import { randomUUID } from "crypto";
import { type JobConfiguration, type JobExecution } from "@prisma/client";
import { type EvalTemplateCodeBased } from "@langfuse/shared";
import {
  instrumentAsync,
  logger,
  resolveConfiguredCodeEvalDispatcher,
  runCodeBasedEvaluationDispatch,
  type ExtractedVariable,
} from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../../../errors/UnrecoverableError";
import { createW3CTraceId } from "../../utils";
import { createInternalEventsWriter } from "../../internal-tracing/createInternalEventsWriter";
import { type EvalExecutionResult } from "../evalCompletion";
import { type EvalExecutionDeps } from "../evalExecutionDeps";

export async function executeCodeBasedEvaluation(params: {
  projectId: string;
  organizationId: string;
  jobExecutionId: string;
  job: JobExecution;
  config: JobConfiguration;
  template: EvalTemplateCodeBased;
  extractedVariables: ExtractedVariable[];
  hasExperimentContext?: boolean;
  environment: string;
  executionMetadata: Record<string, string>;
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

      const executionTraceId = createW3CTraceId(params.jobExecutionId);
      const primaryScoreId = randomUUID();
      const executionMetadata = {
        ...params.executionMetadata,
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

      const dispatchOutcome = await runCodeBasedEvaluationDispatch({
        dispatcher,
        organizationId: params.organizationId,
        projectId: params.projectId,
        executionTraceId,
        jobExecutionId: params.jobExecutionId,
        template: params.template,
        scoreName: params.config.scoreName,
        extractedVariables: params.extractedVariables,
        hasExperimentContext: params.hasExperimentContext ?? false,
        traceName: `Execute evaluator: ${params.template.name}`,
        metadata: {
          ...executionMetadata,
          score_id: primaryScoreId,
        },
        maskErrorsInTrace: true,
        writeTrace: (trace) => createInternalEventsWriter().write(trace),
      });

      if (!dispatchOutcome.success) {
        throw dispatchOutcome.cause;
      }

      span.setAttribute("eval.score.count", dispatchOutcome.scores.length);
      span.setAttribute("eval.score.id", primaryScoreId);

      return {
        scores: dispatchOutcome.scores,
        primaryScoreId,
        executionTraceId,
        metadata: executionMetadata,
      };
    },
  );
}
