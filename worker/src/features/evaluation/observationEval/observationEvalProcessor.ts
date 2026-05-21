import { z } from "zod";
import {
  DEFAULT_TRACE_ENVIRONMENT,
  ObservationEvalExecutionEventSchema,
  extractObservationVariables,
  logger,
  type ExtractedVariable,
} from "@langfuse/shared/src/server";
import {
  observationForEvalSchema,
  observationVariableMappingList,
  isJobConfigExecutable,
  type EvalTemplate,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { type JobConfiguration, type JobExecution } from "@prisma/client";
import { prisma, JobExecutionStatus } from "@langfuse/shared/src/db";
import { UnrecoverableError } from "../../../errors/UnrecoverableError";
import { buildEvalExecutionMetadata } from "../evalRuntime";
import {
  completeEvalExecution,
  type EvalExecutionResult,
} from "../evalCompletion";
import {
  createProductionEvalExecutionDeps,
  type EvalExecutionDeps,
} from "../evalExecutionDeps";
import { getEvalS3StorageClient } from "../s3StorageClient";
import { type ObservationForEval } from "./types";

/**
 * Dependencies for processing observation evals.
 * Allows S3 operations to be injected for testability.
 */
export type ObservationEvalExecutionBaseParams = {
  projectId: string;
  organizationId: string;
  jobExecutionId: string;
  job: JobExecution;
  config: JobConfiguration;
  extractedVariables: ExtractedVariable[];
  hasExperimentContext: boolean;
  environment: string;
  metadata: Record<string, string>;
  deps: EvalExecutionDeps;
};

export type ObservationEvalExecutionParams<TTemplate extends EvalTemplate> =
  ObservationEvalExecutionBaseParams & {
    template: TTemplate;
  };

export type ObservationEvalExecutor<TTemplate extends EvalTemplate> = (
  params: ObservationEvalExecutionParams<TTemplate>,
) => Promise<EvalExecutionResult>;

export type ObservationEvalTemplateValidator<TTemplate extends EvalTemplate> = (
  template: EvalTemplate,
) => TTemplate;

export interface ObservationEvalProcessorDeps {
  downloadObservationFromS3: (path: string) => Promise<string>;
  evalExecutionDeps: EvalExecutionDeps;
}

/**
 * Creates production dependencies for the observation eval processor.
 */
export function createObservationEvalProcessorDeps(): ObservationEvalProcessorDeps {
  return {
    downloadObservationFromS3: async (path: string) => {
      const s3Client = getEvalS3StorageClient();

      return s3Client.download(path);
    },
    evalExecutionDeps: createProductionEvalExecutionDeps(),
  };
}

/**
 * Processes an observation-level evaluation job.
 *
 * This function:
 * 1. Fetches and validates job execution, config, and template
 * 2. Downloads observation data from S3 (stored during scheduling)
 * 3. Extracts variables from the observation
 * 4. Executes the evaluator-specific implementation
 * 5. Completes the eval execution with shared score persistence
 */
type ProcessObservationEvalParams<TTemplate extends EvalTemplate> = {
  event: z.infer<typeof ObservationEvalExecutionEventSchema>;
  validateTemplate: ObservationEvalTemplateValidator<TTemplate>;
  executor: ObservationEvalExecutor<TTemplate>;
  deps?: ObservationEvalProcessorDeps;
};

export async function processObservationEval<TTemplate extends EvalTemplate>(
  params: ProcessObservationEvalParams<TTemplate>,
): Promise<void> {
  const { event, deps = createObservationEvalProcessorDeps() } = params;
  logger.debug(
    `Processing observation eval job ${event.jobExecutionId} for project ${event.projectId}`,
  );

  // Fetch job execution
  const job = await prisma.jobExecution.findFirst({
    where: {
      id: event.jobExecutionId,
      projectId: event.projectId,
    },
  });

  if (!job) {
    logger.info(
      `Job execution ${event.jobExecutionId} not found. It may have been deleted.`,
    );

    return;
  }

  // Observation eval executions may already be CANCELLED if the evaluator was
  // blocked after scheduling, or ERROR if a previous attempt already failed and
  // the processor retried the same queue job.
  if (job.status === "CANCELLED" || job.status === "ERROR") {
    logger.debug(
      `Job execution ${event.jobExecutionId} was cancelled or has an error.`,
    );

    return;
  }

  // Fetch job configuration
  const evalJobConfig = await prisma.jobConfiguration.findFirst({
    where: {
      id: job.jobConfigurationId,
      projectId: event.projectId,
    },
    include: {
      evalTemplate: true,
      project: {
        select: {
          orgId: true,
        },
      },
    },
  });

  if (!evalJobConfig || !evalJobConfig.evalTemplate) {
    throw new UnrecoverableError(
      `Job configuration or template not found for job ${job.id}`,
    );
  }

  if (!isJobConfigExecutable(evalJobConfig)) {
    logger.debug(
      `Job execution ${event.jobExecutionId} is not executable because the evaluator is blocked or inactive.`,
    );

    await prisma.jobExecution.update({
      where: {
        id: job.id,
        projectId: event.projectId,
      },
      data: {
        status: JobExecutionStatus.CANCELLED,
        endTime: new Date(),
      },
    });

    return;
  }

  let evalTemplate: TTemplate;
  try {
    evalTemplate = params.validateTemplate(evalJobConfig.evalTemplate);
  } catch (e) {
    throw new UnrecoverableError(e instanceof Error ? e.message : String(e));
  }

  // Download observation data from S3
  let observationData: ObservationForEval;
  let downloadedString: string;

  try {
    downloadedString = await deps.downloadObservationFromS3(
      event.observationS3Path,
    );
  } catch (e) {
    // S3 download failures are retryable (network issues, temporary unavailability)
    throw new Error(
      `Failed to download observation from S3 at ${event.observationS3Path}: ${e}`,
    );
  }

  // Parse and validate the downloaded data - these are permanent failures
  try {
    const parsedJson = JSON.parse(downloadedString);
    observationData = observationForEvalSchema.parse(parsedJson);
  } catch (e) {
    // JSON parse errors are permanent - the data won't change on retry
    throw new UnrecoverableError(
      `Invalid observation data from S3 at ${event.observationS3Path}: invalid JSON - ${e}`,
    );
  }

  logger.debug(
    `Downloaded observation data for job ${job.id}: span_id=${observationData.span_id}`,
  );

  // Extract variables from observation
  const parsedVariableMapping = observationVariableMappingList.parse(
    evalJobConfig.variableMapping,
  ) as ObservationVariableMapping[];

  const extractedVariables = extractObservationVariables({
    observation: observationData,
    variableMapping: parsedVariableMapping,
  });

  logger.debug(
    `Extracted ${extractedVariables.length} variables for job ${job.id}`,
  );

  const executionParams = {
    projectId: event.projectId,
    organizationId: evalJobConfig.project.orgId,
    jobExecutionId: event.jobExecutionId,
    job,
    config: evalJobConfig,
    extractedVariables,
    hasExperimentContext: Boolean(observationData.experiment_id),
    environment: observationData.environment ?? DEFAULT_TRACE_ENVIRONMENT,
    metadata: buildEvalExecutionMetadata({
      jobExecutionId: event.jobExecutionId,
      jobConfigurationId: job.jobConfigurationId,
      targetTraceId: job.jobInputTraceId,
      targetObservationId: job.jobInputObservationId,
      targetDatasetItemId: job.jobInputDatasetItemId,
    }),
    deps: deps.evalExecutionDeps,
  };

  const executionResult = await params.executor({
    ...executionParams,
    template: evalTemplate,
  });

  await completeEvalExecution({
    projectId: executionParams.projectId,
    jobExecutionId: executionParams.jobExecutionId,
    traceId: executionParams.job.jobInputTraceId,
    observationId: executionParams.job.jobInputObservationId,
    environment: executionParams.environment,
    deps: executionParams.deps,
    result: executionResult,
  });
}
