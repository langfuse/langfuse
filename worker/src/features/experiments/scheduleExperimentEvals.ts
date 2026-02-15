import { DatasetItemDomain } from "@langfuse/shared";
import { PromptExperimentConfig } from "./utils";
import {
  GenerationDetails,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared/src/server";
import {
  fetchObservationEvalConfigs,
  scheduleObservationEvals,
  createObservationEvalSchedulerDeps,
  type ObservationForEval,
} from "../evaluation/observationEval";
import { logger, traceException } from "@langfuse/shared/src/server";

interface ScheduleExperimentEvalsParams {
  projectId: string;
  traceId: string;
  datasetItem: DatasetItemDomain;
  config: PromptExperimentConfig;
  generationDetails: GenerationDetails;
}

/**
 * Schedule observation evals for an experiment generation.
 *
 * This function is called after an experiment LLM call completes to schedule
 * any configured observation-level evals. It mirrors the eval scheduling that
 * happens in the OTEL ingestion queue for externally-ingested observations.
 *
 * @param params.projectId - The project ID
 * @param params.traceId - The trace ID for the experiment run
 * @param params.datasetItem - The dataset item being evaluated
 * @param params.config - The prompt experiment configuration
 * @param params.generationDetails - The generation details extracted from traced events
 */
export async function scheduleExperimentObservationEvals(
  params: ScheduleExperimentEvalsParams,
): Promise<void> {
  const { projectId, traceId, datasetItem, config, generationDetails } = params;

  try {
    // 1. Fetch experiment-targeted eval configs
    const configs = await fetchObservationEvalConfigs(projectId, {
      requireTimeScopeNew: true,
    });
    if (configs.length === 0) return;

    // 2. Build ObservationForEval with experiment context
    // Note: metadata from generation events contains additional context
    // (dataset_id, dataset_item_id, experiment_name, experiment_run_name, etc.)
    const observation: ObservationForEval = {
      // Identifiers
      span_id: generationDetails.observationId,
      trace_id: traceId,
      project_id: projectId,

      // Core properties
      type: "GENERATION",
      name: generationDetails.name || "generation",
      environment: LangfuseInternalTraceEnvironment.PromptExperiments,
      level: "DEFAULT",

      // Prompt info
      prompt_name: config.prompt?.name,
      prompt_version: config.prompt?.version,

      // Experiment fields - critical for matching
      experiment_id: config.runId,
      experiment_name: config.experimentName,
      experiment_dataset_id: datasetItem.datasetId,
      experiment_item_id: datasetItem.id,
      experiment_item_expected_output: datasetItem.expectedOutput
        ? JSON.stringify(datasetItem.expectedOutput)
        : null,
      experiment_item_root_span_id: generationDetails.observationId, // Same as span_id for root

      // Data fields
      input: generationDetails.input,
      output: generationDetails.output,
      metadata: generationDetails.metadata, // Include metadata from merged generation events

      // Empty defaults
      tags: [],
      provided_usage_details: {},
      provided_cost_details: {},
      usage_details: {},
      cost_details: {},
      tool_definitions: {},
      tool_calls: [],
      tool_call_names: [],
    };

    // 3. Schedule evals
    const schedulerDeps = createObservationEvalSchedulerDeps();
    await scheduleObservationEvals({
      observation,
      configs,
      schedulerDeps,
    });

    logger.info("Scheduled experiment observation evals", {
      projectId,
      traceId,
      observationId: generationDetails.observationId,
      configCount: configs.length,
    });
  } catch (error) {
    traceException(error);
    logger.error("Failed to schedule experiment observation evals", {
      error,
      projectId,
      traceId,
    });
    // Don't rethrow - eval scheduling should not fail the experiment
  }
}
