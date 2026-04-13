import {
  fetchObservationEvalConfigs,
  scheduleObservationEvals,
  createObservationEvalSchedulerDeps,
  type ObservationForEval,
} from "../evaluation/observationEval";
import { logger, traceException } from "@langfuse/shared/src/server";

interface ScheduleExperimentEvalsParams {
  observation: ObservationForEval;
}

export async function scheduleExperimentObservationEvals(
  params: ScheduleExperimentEvalsParams,
): Promise<void> {
  const { observation } = params;

  try {
    const configs = await fetchObservationEvalConfigs(observation.project_id);
    if (configs.length === 0) {
      return;
    }

    const schedulerDeps = createObservationEvalSchedulerDeps();
    await scheduleObservationEvals({
      observation,
      configs,
      schedulerDeps,
    });

    logger.info("Scheduled experiment observation evals", {
      projectId: observation.project_id,
      traceId: observation.trace_id,
      observationId: observation.span_id,
      configCount: configs.length,
    });
  } catch (error) {
    traceException(error);
    logger.error("Failed to schedule experiment observation evals", {
      error,
      projectId: observation.project_id,
      traceId: observation.trace_id,
      observationId: observation.span_id,
    });
  }
}
