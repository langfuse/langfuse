import { type JobConfiguration, type JobExecution } from "@prisma/client";
import { type EvalTemplateCodeBased } from "@langfuse/shared";
import {
  CodeEvalExecutionError,
  instrumentAsync,
  logger,
  resolveConfiguredCodeEvalDispatcher,
  runCodeBasedEvaluationDispatch,
  writeInternalTraceViaOtelIngestion,
  type ExtractedVariable,
} from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../../../errors/UnrecoverableError";
import { createW3CTraceId } from "../../utils";
import { type EvalExecutionResult } from "../evalCompletion";
import { type EvalExecutionDeps } from "../evalExecutionDeps";

export async function executeCodeBasedEvaluation(params: {
  projectId: string;
  organizationId: string;
  job: JobExecution;
  config: JobConfiguration;
  template: EvalTemplateCodeBased;
  extractedVariables: ExtractedVariable[];
  hasExperimentContext?: boolean;
  executionMetadata: Record<string, string>;
  // Unused by code-based eval; the shared observation processor passes it.
  deps?: EvalExecutionDeps;
}): Promise<EvalExecutionResult> {
  return instrumentAsync(
    { name: "eval.execute-code-based-eval" },
    async (span) => {
      const dispatcher = resolveConfiguredCodeEvalDispatcher();
      const jobExecutionId = params.job.id;

      if (!dispatcher) {
        throw new UnrecoverableError("Code eval dispatcher is not configured");
      }

      const executionTraceId = createW3CTraceId(jobExecutionId);
      const executionMetadata = {
        ...params.executionMetadata,
        dispatcher_name: dispatcher.name,
        code_eval_runtime: params.template.sourceCodeLanguage,
      };
      span.setAttribute("langfuse.project.id", params.projectId);
      span.setAttribute("eval.job_execution.id", jobExecutionId);
      span.setAttribute("eval.job_configuration.id", params.config.id);
      span.setAttribute("eval.template.id", params.template.id);
      span.setAttribute("eval.template.version", params.template.version);
      span.setAttribute("eval.dispatcher.name", dispatcher.name);
      span.setAttribute(
        "eval.runner.language",
        params.template.sourceCodeLanguage,
      );

      logger.debug(
        `Executing code-based evaluation for job ${jobExecutionId} in project ${params.projectId}`,
      );

      const dispatchOutcome = await runCodeBasedEvaluationDispatch({
        dispatcher,
        organizationId: params.organizationId,
        projectId: params.projectId,
        executionTraceId,
        jobExecutionId,
        template: params.template,
        extractedVariables: params.extractedVariables,
        hasExperimentContext: params.hasExperimentContext ?? false,
        traceName: `Execute evaluator: ${params.template.name}`,
        metadata: executionMetadata,
        // Publish via the OTel ingestion pipeline (like LLM-as-a-judge) so the
        // trace reaches the legacy tables too in dual write mode — a direct
        // events-table write alone 404s in the trace detail view.
        writeTrace: (trace) => writeInternalTraceViaOtelIngestion(trace),
      });

      if (!dispatchOutcome.success) {
        if (dispatchOutcome.error.retryable === false) {
          throw new UnrecoverableError(dispatchOutcome.error.message);
        }

        throw new CodeEvalExecutionError(dispatchOutcome.error);
      }

      span.setAttribute("eval.score.count", dispatchOutcome.scores.length);

      return {
        scores: dispatchOutcome.scores,
        executionTraceId,
        metadata: executionMetadata,
      };
    },
  );
}
