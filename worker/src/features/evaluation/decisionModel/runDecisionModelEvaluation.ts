import {
  type EvaluatorBlockReason,
  type JobConfiguration,
  type JobExecution,
} from "@prisma/client";
import {
  getBlockReasonForInvalidModelConfig,
  getEvaluatorBlockMetadata,
  PersistedEvalOutputDefinitionSchema,
  type EvalExecutionContext,
  type EvalTemplateDecisionModel,
} from "@langfuse/shared";
import {
  blockEvaluator,
  buildDecisionModelTraceInput,
  classifyEvaluatorLlmError,
  DecisionModelEvaluatorError,
  EvaluatorBlockSource,
  executeDecisionModelEvaluator,
  instrumentAsync,
  isDecisionModelAdapter,
  logger,
  type ExtractedVariable,
} from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../../../errors/UnrecoverableError";
import { createW3CTraceId } from "../../utils";
import { type EvalExecutionResult } from "../evalCompletion";
import { type EvalExecutionDeps } from "../evalExecutionDeps";
import { toNormalizedScores } from "../evalService";
import {
  buildEvalExecutionSpanAttributes,
  buildEvaluatorLlmErrorSpanAttributes,
} from "../evalSpanAttributes";

/**
 * Executes a decision-model evaluator (experimental): resolves the TypeSafe
 * connection, asks one Choice question about the observation, and returns a
 * single categorical score. Definition and answer problems are unrecoverable.
 * Provider failures are AI SDK errors and follow the LLM-as-a-judge policy:
 * the queue retries rate limits, and credential failures pause the evaluator.
 */
export async function runDecisionModelEvaluation({
  projectId,
  jobExecutionId,
  job,
  config,
  template,
  extractedVariables,
  executionMetadata,
  evaluationContext,
  deps,
  evaluatorId,
}: {
  projectId: string;
  jobExecutionId: string;
  job: JobExecution;
  config: JobConfiguration;
  template: EvalTemplateDecisionModel;
  extractedVariables: ExtractedVariable[];
  executionMetadata: Record<string, string>;
  evaluationContext: EvalExecutionContext;
  deps: EvalExecutionDeps;
  evaluatorId?: string;
}): Promise<EvalExecutionResult> {
  const pauseEvaluator = async (
    blockReason: EvaluatorBlockReason,
    source: EvaluatorBlockSource,
  ) => {
    if (!evaluatorId) {
      throw new UnrecoverableError(
        `Evaluator identity missing for job ${jobExecutionId}`,
      );
    }
    await blockEvaluator({
      projectId,
      evaluatorId,
      blockReason,
      blockMessage: getEvaluatorBlockMetadata(blockReason).message,
      source,
    });
  };

  return instrumentAsync(
    { name: "eval.execute-decision-model" },
    async (span) => {
      span.setAttribute("langfuse.project.id", projectId);
      span.setAttribute("eval.job_execution.id", jobExecutionId);
      span.setAttribute("eval.template.name", template.name);
      span.setAttribute("eval.template.id", template.id);
      span.setAttribute("eval.template.version", template.version);
      span.setAttribute("eval.score.name", config.scoreName);
      span.setAttributes(buildEvalExecutionSpanAttributes({ config }));
      if (job.jobInputTraceId) {
        span.setAttribute("eval.target.trace_id", job.jobInputTraceId);
      }
      if (job.jobInputObservationId) {
        span.setAttribute(
          "eval.target.observation_id",
          job.jobInputObservationId,
        );
      }

      span.setAttribute("eval.execution.stage", "validate_template");
      const parsedOutputDefinition =
        PersistedEvalOutputDefinitionSchema.safeParse(
          template.outputDefinition,
        );
      if (!parsedOutputDefinition.success) {
        span.setAttribute("eval.execution.outcome", "invalid_template");
        throw new UnrecoverableError(
          "Output definition not found or invalid in evaluation template",
        );
      }

      span.setAttribute("eval.execution.stage", "resolve_model_config");
      const modelConfig = await deps.fetchModelConfig({
        projectId,
        provider: template.provider ?? undefined,
        model: template.model ?? undefined,
        modelParams: null,
      });

      let modelConfigError: string | null = null;
      if (!modelConfig.valid) {
        modelConfigError = modelConfig.error;
      } else if (
        // The connection's adapter is authoritative; the resolved config only
        // carries provider/model plus the stored connection.
        !isDecisionModelAdapter(modelConfig.config.apiKey.adapter)
      ) {
        modelConfigError = `Connection "${modelConfig.config.provider}" is not a decision-model connection`;
      }
      if (!modelConfig.valid || modelConfigError !== null) {
        const blockReason = getBlockReasonForInvalidModelConfig({
          templateProvider: template.provider,
          templateModel: template.model,
          error: modelConfigError ?? "",
        });
        span.setAttributes({
          "eval.execution.outcome": "blocked",
          "eval.llm.blocked": true,
          "eval.llm.block.reason": blockReason,
          "eval.llm.block.source": EvaluatorBlockSource.INVALID_MODEL_CONFIG,
        });
        await pauseEvaluator(
          blockReason,
          EvaluatorBlockSource.INVALID_MODEL_CONFIG,
        );
        logger.warn(
          `Eval job ${jobExecutionId} will fail. ${modelConfigError}`,
        );
        throw new UnrecoverableError(
          `Invalid model configuration for job ${jobExecutionId}: ${modelConfigError}`,
        );
      }

      span.setAttribute("eval.model.provider", modelConfig.config.provider);
      span.setAttribute("eval.model.name", modelConfig.config.model);
      span.setAttribute(
        "eval.model.adapter",
        modelConfig.config.apiKey.adapter,
      );

      const executionTraceId = createW3CTraceId(jobExecutionId);
      span.setAttributes({
        "eval.execution.trace_id": executionTraceId,
        "eval.execution.stage": "call_decision_model",
      });

      const traceStartTime = new Date();
      let execution: Awaited<ReturnType<typeof executeDecisionModelEvaluator>>;
      try {
        execution = await executeDecisionModelEvaluator({
          instructions: template.prompt,
          variables: extractedVariables,
          outputDefinition: parsedOutputDefinition.data,
          client: {
            evaluateChoice: (params) =>
              deps.callDecisionModel({
                modelConfig: modelConfig.config,
                ...params,
              }),
          },
        });
      } catch (e) {
        if (e instanceof DecisionModelEvaluatorError) {
          span.setAttribute("eval.execution.outcome", "invalid_model_output");
          throw new UnrecoverableError(e.message);
        }

        const classification = classifyEvaluatorLlmError(e);
        span.setAttributes(
          buildEvaluatorLlmErrorSpanAttributes(classification),
        );
        span.setAttribute(
          "eval.execution.outcome",
          classification?.blockReason ? "blocked" : "llm_error",
        );
        if (classification?.blockReason) {
          await pauseEvaluator(
            classification.blockReason,
            EvaluatorBlockSource.LLM_COMPLETION_ERROR,
          );
          span.setAttribute("eval.llm.block.applied", true);
        }
        throw e;
      }

      span.setAttributes({
        "eval.decision_model.model": execution.evaluation.model,
        "eval.decision_model.choice": execution.evaluation.answer.choice,
        ...(execution.evaluation.answer.confidence !== null
          ? {
              "eval.decision_model.confidence":
                execution.evaluation.answer.confidence,
            }
          : {}),
      });
      logger.debug(
        `Job ${jobExecutionId} received decision-model answer: ${execution.output.reasoning}`,
      );

      // The trace is a debugging aid; a write failure must not fail the score.
      try {
        await deps.writeInternalTrace(
          buildDecisionModelTraceInput({
            projectId,
            executionTraceId,
            traceStartTime,
            traceName: `Execute evaluator: ${template.name}`,
            state: execution.state,
            question: execution.question,
            evaluation: execution.evaluation,
            metadata: executionMetadata,
            evaluationContext,
          }),
        );
      } catch (error) {
        logger.warn("Failed to write decision-model execution trace", {
          jobExecutionId,
          executionTraceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const scores = toNormalizedScores({
        outputResult: execution.output,
        scoreName: config.scoreName,
        metadata: execution.scoreMetadata,
      });

      span.setAttribute("eval.score.count", scores.length);
      span.setAttributes({
        "eval.execution.stage": "completed",
        "eval.execution.outcome": "success",
      });

      return {
        scores,
        executionTraceId,
        metadata: executionMetadata,
        evaluationContext,
      };
    },
  );
}
