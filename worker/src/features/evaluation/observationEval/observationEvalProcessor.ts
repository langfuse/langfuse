import { z } from "zod";
import {
  DEFAULT_TRACE_ENVIRONMENT,
  ObservationEvalExecutionEventSchema,
  extractObservationVariables,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { isEvalTargetEnvironmentAllowed } from "../isEvalTargetEnvironmentAllowed";
import {
  getCodeEvalVariableMapping,
  observationForEvalSchema,
  observationVariableMappingList,
  type EvalTemplateWithType,
  canRunEvalRule,
} from "@langfuse/shared";
import {
  EvalTemplateType,
  JobConfigState,
  Prisma,
  type EvalTemplate,
  type JobConfiguration,
  type JobExecution,
} from "@prisma/client";
import { prisma, JobExecutionStatus } from "@langfuse/shared/src/db";
import { UnrecoverableError } from "../../../errors/UnrecoverableError";
import { buildEvalExecutionData } from "@langfuse/shared/src/server";
import {
  completeEvalExecution,
  type EvalExecutionResult,
} from "../evalCompletion";
import {
  createProductionEvalExecutionDeps,
  type EvalExecutionDeps,
} from "../evalExecutionDeps";
import { runLLMAsJudgeEvaluation } from "../evalService";
import { executeCodeBasedEvaluation } from "../codeBased";
import { getEvalS3StorageClient } from "../s3StorageClient";
import { type ObservationForEval } from "./types";

/**
 * Dependencies for processing observation evals.
 * Allows S3 operations to be injected for testability.
 */
export interface ObservationEvalProcessorDeps {
  downloadObservationFromS3: (path: string) => Promise<string>;
  evalExecutionDeps: EvalExecutionDeps;
}

/**
 * Creates production dependencies for the observation eval processor.
 */
function createObservationEvalProcessorDeps(): ObservationEvalProcessorDeps {
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
 * 1. Fetches job execution, config, and the expected template type
 * 2. Downloads observation data from S3 (stored during scheduling)
 * 3. Extracts variables from the observation
 * 4. Executes the evaluator-specific implementation
 * 5. Completes the eval execution with shared score persistence
 */
type ObservationEvalExecutionType =
  | typeof EvalTemplateType.LLM_AS_JUDGE
  | typeof EvalTemplateType.CODE;

export type ObservationEvalProcessorOutcome =
  | "completed"
  | "cancelled"
  | "skipped";

type ProcessObservationEvalParams = {
  event: z.infer<typeof ObservationEvalExecutionEventSchema>;
  executionType: ObservationEvalExecutionType;
  deps?: ObservationEvalProcessorDeps;
};

export async function processObservationEval(
  params: ProcessObservationEvalParams,
): Promise<ObservationEvalProcessorOutcome> {
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

    return "skipped";
  }

  // Observation eval executions may already be terminal if the evaluator was
  // blocked after scheduling or the queue job was redelivered after processing.
  if (
    job.status === "CANCELLED" ||
    job.status === "ERROR" ||
    job.status === "COMPLETED"
  ) {
    logger.debug(`Job execution ${event.jobExecutionId} is already terminal.`);

    return "skipped";
  }

  const resolved = await resolveObservationEvalExecution({
    event,
    job,
    executionType: params.executionType,
  });
  if (resolved.type === "cancelled") {
    await cancelJobExecution(job, event.projectId, resolved.reason);
    return "cancelled";
  }
  const { config: evalJobConfig, template } = resolved;

  if (!canRunEvalRule(evalJobConfig, event.executionMode)) {
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

    return "cancelled";
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

  // Final fail-closed loop safeguard: never execute an eval whose target
  // lives in an internal Langfuse environment, regardless of which scheduling
  // path created the job. See isEvalTargetEnvironmentAllowed.
  if (!isEvalTargetEnvironmentAllowed(observationData.environment)) {
    logger.warn(
      "Cancelling eval job targeting an internal Langfuse environment",
      {
        jobExecutionId: event.jobExecutionId,
        projectId: event.projectId,
        environment: observationData.environment,
        observationId: observationData.span_id,
      },
    );
    recordIncrement(
      "langfuse.evaluation-execution.internal_target_blocked",
      1,
      {
        source: "observation-eval",
      },
    );
    await prisma.jobExecution.update({
      where: { id: job.id, projectId: event.projectId },
      data: { status: JobExecutionStatus.CANCELLED, endTime: new Date() },
    });

    return "cancelled";
  }

  // Extract variables from observation
  const parsedVariableMapping = observationVariableMappingList.parse(
    evalJobConfig.variableMapping,
  );

  const extractedVariables = extractObservationVariables({
    observation: observationData,
    variableMapping: parsedVariableMapping,
  });

  logger.debug(
    `Extracted ${extractedVariables.length} variables for job ${job.id}`,
  );

  const executionParams = {
    projectId: event.projectId,
    organizationId: resolved.organizationId,
    jobExecutionId: event.jobExecutionId,
    job,
    config: evalJobConfig,
    extractedVariables,
    hasExperimentContext: Boolean(observationData.experiment_id),
    environment: observationData.environment ?? DEFAULT_TRACE_ENVIRONMENT,
    ...buildEvalExecutionData({
      type: "JOB",
      jobExecutionId: event.jobExecutionId,
      jobConfigurationId: job.jobConfigurationId,
      ...(resolved.type === "v2"
        ? {
            evaluationRuleId: resolved.evaluationRuleId,
            assignmentId: resolved.assignmentId,
            evaluatorId: resolved.evaluatorId,
            evaluatorVersionId: resolved.evaluatorVersionId,
          }
        : {}),
      targetTraceId: job.jobInputTraceId,
      targetObservationId: job.jobInputObservationId,
      targetDatasetItemId: job.jobInputDatasetItemId,
    }),
    deps: deps.evalExecutionDeps,
  };

  let executionResult: EvalExecutionResult;
  switch (template.type) {
    case EvalTemplateType.LLM_AS_JUDGE:
      executionResult = await runLLMAsJudgeEvaluation({
        ...executionParams,
        template,
        // A self-inflicted pause targets the evaluator, so every rule using it
        // stops; legacy executions pause their job configuration instead.
        ...(resolved.type === "v2"
          ? { evaluatorId: resolved.evaluatorId }
          : {}),
      });
      break;
    case EvalTemplateType.CODE:
      executionResult = await executeCodeBasedEvaluation({
        ...executionParams,
        template,
        ...(resolved.type === "v2"
          ? { evaluatorId: resolved.evaluatorId }
          : {}),
      });
      break;
  }

  await completeEvalExecution({
    projectId: executionParams.projectId,
    jobExecutionId: executionParams.jobExecutionId,
    traceId: executionParams.job.jobInputTraceId,
    observationId: executionParams.job.jobInputObservationId,
    environment: executionParams.environment,
    deps: executionParams.deps,
    result: executionResult,
  });

  return "completed";
}

async function cancelJobExecution(
  job: JobExecution,
  projectId: string,
  reason: string,
) {
  logger.debug("Cancelling observation evaluation job", {
    jobExecutionId: job.id,
    projectId,
    reason,
  });
  await prisma.jobExecution.update({
    where: { id: job.id, projectId },
    data: { status: JobExecutionStatus.CANCELLED, endTime: new Date() },
  });
}

/**
 * Resolves which evaluator definition a queued job must execute.
 *
 * Jobs scheduled since evaluator v2 carry their evaluator identity in the
 * queue payload, so this is a direct lookup. For jobs queued by an older
 * worker, the backfill preserves `job_configurations.id` as the rule id, so we
 * resolve through that rule's assignment.
 */
async function resolveObservationEvalExecution(params: {
  event: z.infer<typeof ObservationEvalExecutionEventSchema>;
  job: JobExecution;
  executionType: ObservationEvalExecutionType;
}) {
  const { event, job, executionType } = params;
  const { projectId, evaluatorId, evaluationRuleId } = event;

  if (!evaluatorId) {
    const migratedAssignment =
      await prisma.evaluationRuleEvaluatorAssignment.findFirst({
        where: {
          projectId,
          evaluationRuleId: job.jobConfigurationId,
          evaluator: { projectId, type: executionType },
        },
        include: {
          evaluationRule: true,
          evaluator: { include: evaluatorInclude },
        },
      });
    if (migratedAssignment) {
      const { evaluationRule: rule, evaluator } = migratedAssignment;
      if (
        rule.status !== JobConfigState.ACTIVE &&
        event.executionMode !== "MANUAL"
      ) {
        return { type: "cancelled" as const, reason: "rule-inactive" };
      }
      return buildV2Execution({
        rule,
        assignment: migratedAssignment,
        evaluator,
      });
    }
    return { type: "cancelled" as const, reason: "assignment-unavailable" };
  }

  // Manual batch runs address the evaluator directly, with no rule to re-check:
  // the user's selection already authorized the run.
  if (!evaluationRuleId) {
    const evaluator = await prisma.evaluator.findFirst({
      where: { id: evaluatorId, projectId, type: executionType },
      include: evaluatorInclude,
    });
    if (!evaluator) {
      return { type: "cancelled" as const, reason: "evaluator-unavailable" };
    }
    // Ruleless batch runs have no assignment row. A mapping on the queue
    // payload is the override; omitting it inherits the version mapping.
    const assignment =
      event.variableMapping !== undefined
        ? { variableMapping: event.variableMapping }
        : null;
    return buildV2Execution({ rule: null, assignment, evaluator });
  }

  // The assignment is what authorizes this execution — it is the (rule,
  // evaluator) pairing that was scheduled, and it carries the pairing's
  // mapping override. Resolving it directly answers "does this pairing still
  // exist" and loads the rule and evaluator in the same round trip; a rule
  // that was deleted, an evaluator that was detached or deleted, and an
  // evaluator whose type no longer matches this queue all collapse to no row.
  const assignment = await prisma.evaluationRuleEvaluatorAssignment.findFirst({
    where: {
      projectId,
      evaluationRuleId,
      evaluatorId,
      evaluator: { projectId, type: executionType },
    },
    include: {
      evaluationRule: true,
      evaluator: { include: evaluatorInclude },
    },
  });
  if (!assignment) {
    return { type: "cancelled" as const, reason: "assignment-unavailable" };
  }
  const { evaluationRule: rule, evaluator } = assignment;
  if (
    rule.status !== JobConfigState.ACTIVE &&
    event.executionMode !== "MANUAL"
  ) {
    return { type: "cancelled" as const, reason: "rule-inactive" };
  }

  return buildV2Execution({ rule, assignment, evaluator });
}

const evaluatorInclude = {
  project: { select: { orgId: true } },
  // A rule runs its evaluator's current version, so the definition is resolved
  // here rather than pinned at dispatch.
  versions: { orderBy: { version: "desc" }, take: 1 },
} satisfies Prisma.EvaluatorInclude;

function normalizeEvalTemplate(
  template: EvalTemplate & { promptMessages?: unknown },
  executionType: ObservationEvalExecutionType,
): EvalTemplateWithType {
  switch (executionType) {
    case EvalTemplateType.LLM_AS_JUDGE:
      if (
        template.type !== executionType ||
        template.prompt === null ||
        template.outputDefinition === null
      ) {
        throw new UnrecoverableError(
          "Evaluator template is incomplete for LLM_AS_JUDGE execution",
        );
      }
      return {
        ...template,
        type: executionType,
        prompt: template.prompt,
        outputDefinition: template.outputDefinition,
        sourceCode: null,
        sourceCodeLanguage: null,
      };
    case EvalTemplateType.CODE:
      if (
        template.type !== executionType ||
        template.sourceCode === null ||
        template.sourceCodeLanguage === null
      ) {
        throw new UnrecoverableError(
          "Evaluator template is incomplete for CODE execution",
        );
      }
      return {
        ...template,
        type: executionType,
        prompt: null,
        outputDefinition: null,
        sourceCode: template.sourceCode,
        sourceCodeLanguage: template.sourceCodeLanguage,
      };
  }
}

type ResolvedEvaluator = Prisma.EvaluatorGetPayload<{
  include: typeof evaluatorInclude;
}>;
type ResolvedEvaluationRule = Prisma.EvaluationRuleGetPayload<object>;

/**
 * Shapes the resolved rows into the `JobConfiguration`/`EvalTemplate` pair the
 * shared executors still speak, and returns the v2 identity recorded on the
 * execution. Returns a cancellation when the evaluator is unusable, which is
 * the one condition that survives the resolution query: it is state on rows
 * that do exist.
 */
function buildV2Execution(params: {
  rule: ResolvedEvaluationRule | null;
  assignment: {
    id?: string;
    variableMapping: Prisma.JsonValue;
  } | null;
  evaluator: ResolvedEvaluator;
}) {
  const { rule, assignment, evaluator } = params;
  if (evaluator.blockedAt) {
    return { type: "cancelled" as const, reason: "evaluator-blocked" };
  }
  const version = evaluator.versions[0];
  if (!version) {
    return { type: "cancelled" as const, reason: "version-missing" };
  }
  const organizationId = evaluator.project.orgId;
  const variableMapping =
    assignment?.variableMapping ??
    version.variableMapping ??
    (evaluator.type === EvalTemplateType.CODE
      ? getCodeEvalVariableMapping()
      : []);
  const config = {
    id: rule?.id ?? evaluator.id,
    createdAt: rule?.createdAt ?? evaluator.createdAt,
    updatedAt: rule?.updatedAt ?? evaluator.updatedAt,
    projectId: rule?.projectId ?? evaluator.projectId,
    jobType: "EVAL",
    status: rule?.status ?? JobConfigState.ACTIVE,
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
    evalTemplateId: version.id,
    scoreName: evaluator.name,
    filter: rule?.filter ?? [],
    targetObject: rule?.targetObject ?? "event",
    variableMapping,
    sampling: rule?.sampling ?? new Prisma.Decimal(1),
    delay: rule?.delay ?? 0,
    timeScope: rule?.timeScope ?? ["NEW"],
  } satisfies JobConfiguration;
  const template = {
    id: version.id,
    createdAt: version.createdAt,
    updatedAt: version.createdAt,
    projectId: rule?.projectId ?? evaluator.projectId,
    name: evaluator.name,
    version: version.version,
    prompt: version.prompt,
    promptMessages: version.promptMessages,
    type: evaluator.type,
    partner: version.partner,
    model: version.model,
    provider: version.provider,
    modelParams: version.modelParams,
    vars: version.vars,
    outputDefinition: version.outputDefinition,
    sourceCode: version.sourceCode,
    sourceCodeLanguage: version.sourceCodeLanguage,
  };

  return {
    type: "v2" as const,
    config,
    template: normalizeEvalTemplate(template, evaluator.type),
    organizationId,
    evaluationRuleId: rule?.id,
    assignmentId: assignment?.id,
    evaluatorId: evaluator.id,
    evaluatorVersionId: version.id,
  };
}
