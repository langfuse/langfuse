/* eslint-disable @typescript-eslint/no-use-before-define */
import { z } from "zod";
import {
  DEFAULT_TRACE_ENVIRONMENT,
  EvalJobExecutionEventSchema,
  UnsupportedTraceBatchInputVersionError,
  createTraceBatchInputStorage,
  extractObservationVariables,
  logger,
  recordIncrement,
  buildEvalExecutionData,
  type ExtractedVariable,
} from "@langfuse/shared/src/server";
import { extractTranscriptEvalVariables } from "../../eventsDispatch/traceTranscriptEval";
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
import {
  EvalFailureError,
  EvalFailureReason,
  UnrecoverableEvalFailureError,
} from "../evalFailureErrors";

import {
  completeEvalExecution,
  type EvalExecutionResult,
} from "../evalCompletion";
import {
  createProductionEvalExecutionDeps,
  type EvalExecutionDeps,
} from "../evalExecutionDeps";
import { runLLMAsJudgeEvaluation } from "../evalService";
import { executeCodeBasedEvaluation } from "../codeBased/executeCodeBasedEvaluation";
import { runDecisionModelEvaluation } from "../decisionModel/runDecisionModelEvaluation";
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

const EVALUATOR_TYPES_BY_EXECUTION_TYPE: Record<
  ObservationEvalExecutionType,
  EvalTemplateType[]
> = {
  [EvalTemplateType.LLM_AS_JUDGE]: [
    EvalTemplateType.LLM_AS_JUDGE,
    EvalTemplateType.DECISION_MODEL,
  ],
  [EvalTemplateType.CODE]: [EvalTemplateType.CODE],
};

export type ObservationEvalProcessorOutcome =
  | "completed"
  | "cancelled"
  | "skipped";

type EvalJobExecutionInput = z.infer<typeof EvalJobExecutionEventSchema>;

function isTraceTranscriptJob(
  event: EvalJobExecutionInput,
): event is Extract<EvalJobExecutionInput, { type: "trace-transcript" }> {
  return "type" in event && event.type === "trace-transcript";
}

type ProcessEvalParams = {
  event: EvalJobExecutionInput;
  executionType: ObservationEvalExecutionType;
  deps?: ObservationEvalProcessorDeps;
};

export async function processEval(
  params: ProcessEvalParams,
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

  const prepareParams = {
    variableMapping: evalJobConfig.variableMapping,
    jobExecutionId: event.jobExecutionId,
    projectId: event.projectId,
  };
  const prepared = isTraceTranscriptJob(event)
    ? await prepare(transcriptTarget(event.transcriptS3Path), prepareParams)
    : await prepare(
        observationTarget({
          observationS3Path: event.observationS3Path,
          deps,
          jobId: job.id,
        }),
        prepareParams,
      );
  if (prepared.outcome === "cancelled") return "cancelled";

  logger.debug(
    `Extracted ${prepared.extractedVariables.length} variables for job ${job.id}`,
  );

  const executionParams = {
    projectId: event.projectId,
    organizationId: resolved.organizationId,
    jobExecutionId: event.jobExecutionId,
    job,
    config: evalJobConfig,
    extractedVariables: prepared.extractedVariables,
    environment: prepared.environment,
    ...(prepared.hasExperimentContext !== undefined
      ? { hasExperimentContext: prepared.hasExperimentContext }
      : {}),
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
      batchActionId: event.batchActionId,
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
    case EvalTemplateType.DECISION_MODEL:
      executionResult = await runDecisionModelEvaluation({
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
    scoreTimestamp: executionParams.job.createdAt,
    traceId: executionParams.job.jobInputTraceId,
    observationId: executionParams.job.jobInputObservationId,
    environment: executionParams.environment,
    executionType: params.executionType,
    deps: executionParams.deps,
    result: executionResult,
  });

  return "completed";
}

async function downloadObservationForEval(
  observationS3Path: string | undefined,
  deps: ObservationEvalProcessorDeps,
): Promise<ObservationForEval> {
  let downloadedString: string;
  try {
    downloadedString = await deps.downloadObservationFromS3(
      observationS3Path as string,
    );
  } catch (e) {
    // S3 download failures are retryable (network issues, temporary unavailability)
    throw new EvalFailureError(
      `Failed to download observation from S3 at ${observationS3Path}: ${e}`,
      EvalFailureReason.ObservationDownload,
    );
  }
  try {
    return observationForEvalSchema.parse(JSON.parse(downloadedString));
  } catch (e) {
    // JSON parse errors are permanent - the data won't change on retry
    throw new UnrecoverableEvalFailureError(
      `Invalid observation data from S3 at ${observationS3Path}: invalid JSON - ${e}`,
      EvalFailureReason.InvalidObservationData,
    );
  }
}

async function cancelInternalTarget(params: {
  jobExecutionId: string;
  projectId: string;
  environment: string | null | undefined;
  observationId?: string;
}): Promise<void> {
  // Final fail-closed loop safeguard: never execute an eval whose target
  // lives in an internal Langfuse environment, regardless of which scheduling
  // path created the job. See isEvalTargetEnvironmentAllowed.
  logger.warn(
    "Cancelling eval job targeting an internal Langfuse environment",
    params,
  );
  recordIncrement("langfuse.evaluation-execution.internal_target_blocked", 1, {
    source: "observation-eval",
  });
  await prisma.jobExecution.update({
    where: { id: params.jobExecutionId, projectId: params.projectId },
    data: { status: JobExecutionStatus.CANCELLED, endTime: new Date() },
  });
}

type EvalTarget<T> = {
  path: string | undefined;
  load: (path: string | undefined) => Promise<T>;
  environment: (loaded: T) => string | null | undefined;
  observationId?: (loaded: T) => string | undefined;
  experimentId?: (loaded: T) => string | null | undefined;
  extract: (
    loaded: T,
    variableMapping: Prisma.JsonValue,
  ) => ExtractedVariable[];
};

/** Load the target, refuse an internal environment, then extract variables. */
async function prepare<T>(
  target: EvalTarget<T>,
  params: {
    variableMapping: Prisma.JsonValue;
    jobExecutionId: string;
    projectId: string;
  },
): Promise<
  | { outcome: "cancelled" }
  | {
      outcome: "ready";
      extractedVariables: ExtractedVariable[];
      environment: string;
      hasExperimentContext?: boolean;
    }
> {
  const loaded = await target.load(target.path);
  const environment = target.environment(loaded);
  if (!isEvalTargetEnvironmentAllowed(environment)) {
    await cancelInternalTarget({
      jobExecutionId: params.jobExecutionId,
      projectId: params.projectId,
      environment,
      observationId: target.observationId?.(loaded),
    });
    return { outcome: "cancelled" };
  }
  return {
    outcome: "ready",
    extractedVariables: target.extract(loaded, params.variableMapping),
    environment: environment ?? DEFAULT_TRACE_ENVIRONMENT,
    ...(target.experimentId
      ? { hasExperimentContext: Boolean(target.experimentId(loaded)) }
      : {}),
  };
}

function observationTarget(params: {
  observationS3Path: string | undefined;
  deps: ObservationEvalProcessorDeps;
  jobId: string;
}): EvalTarget<ObservationForEval> {
  return {
    path: params.observationS3Path,
    async load(path) {
      const observation = await downloadObservationForEval(path, params.deps);
      logger.debug(
        `Downloaded observation data for job ${params.jobId}: span_id=${observation.span_id}`,
      );
      return observation;
    },
    environment: (observation) => observation.environment,
    observationId: (observation) => observation.span_id,
    experimentId: (observation) => observation.experiment_id,
    extract(observation, variableMapping) {
      return extractObservationVariables({
        observation,
        variableMapping: observationVariableMappingList.parse(variableMapping),
      });
    },
  };
}

function transcriptTarget(
  transcriptS3Path: string,
): EvalTarget<StoredTranscript> {
  return {
    path: transcriptS3Path,
    async load(path = transcriptS3Path) {
      let stored;
      try {
        stored = await createTraceBatchInputStorage().get(path);
      } catch (error) {
        if (error instanceof UnsupportedTraceBatchInputVersionError)
          throw error;
        if (error instanceof SyntaxError || error instanceof z.ZodError) {
          throw new UnrecoverableEvalFailureError(
            `Invalid transcript at ${path}: ${error}`,
            EvalFailureReason.InvalidObservationData,
          );
        }
        throw new EvalFailureError(
          `Failed to read transcript at ${path}: ${error}`,
          EvalFailureReason.ObservationDownload,
        );
      }
      if (stored.transcript == null) {
        throw new UnrecoverableEvalFailureError(
          "No transcript to evaluate.",
          EvalFailureReason.InvalidObservationData,
        );
      }
      return { ...stored, transcript: stored.transcript };
    },
    environment: (stored) => stored.traceContext.environment,
    extract(stored, variableMapping) {
      let parsedMapping;
      try {
        parsedMapping = observationVariableMappingList.parse(variableMapping);
      } catch {
        throw new UnrecoverableEvalFailureError(
          "Transcript evaluation requires a threads variable.",
          EvalFailureReason.InvalidObservationData,
        );
      }
      const extracted = extractTranscriptEvalVariables(
        stored.transcript.threads,
        parsedMapping,
      );
      if (!extracted.ok) {
        throw new UnrecoverableEvalFailureError(
          extracted.error,
          EvalFailureReason.InvalidObservationData,
        );
      }
      return extracted.variables;
    },
  };
}

type StoredTraceInputs = Awaited<
  ReturnType<ReturnType<typeof createTraceBatchInputStorage>["get"]>
>;
type StoredTranscript = StoredTraceInputs & {
  transcript: NonNullable<StoredTraceInputs["transcript"]>;
};

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
  event: EvalJobExecutionInput;
  job: JobExecution;
  executionType: ObservationEvalExecutionType;
}) {
  const { event, job, executionType } = params;
  const { projectId, evaluatorId, evaluationRuleId } = event;
  const evaluatorTypeFilter = {
    in: EVALUATOR_TYPES_BY_EXECUTION_TYPE[executionType],
  };

  if (!evaluatorId) {
    const migratedAssignment =
      await prisma.evaluationRuleEvaluatorAssignment.findFirst({
        where: {
          projectId,
          evaluationRuleId: job.jobConfigurationId,
          evaluator: { projectId, type: evaluatorTypeFilter },
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
        event,
      });
    }
    return { type: "cancelled" as const, reason: "assignment-unavailable" };
  }

  // Manual batch runs address the evaluator directly, with no rule to re-check:
  // the user's selection already authorized the run.
  if (!evaluationRuleId) {
    const evaluator = await prisma.evaluator.findFirst({
      where: { id: evaluatorId, projectId, type: evaluatorTypeFilter },
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
    return buildV2Execution({
      rule: null,
      assignment,
      evaluator,
      event,
    });
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
      evaluator: { projectId, type: evaluatorTypeFilter },
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

  return buildV2Execution({
    rule,
    assignment,
    evaluator,
    event,
  });
}

const evaluatorInclude = {
  project: { select: { orgId: true } },
  // A rule runs its evaluator's current version, so the definition is resolved
  // here rather than pinned at dispatch.
  versions: { orderBy: { version: "desc" }, take: 1 },
} satisfies Prisma.EvaluatorInclude;

function normalizeEvalTemplate(
  template: EvalTemplate & { promptMessages?: unknown; questions?: unknown },
  evaluatorType: EvalTemplateType,
): EvalTemplateWithType {
  switch (evaluatorType) {
    case EvalTemplateType.LLM_AS_JUDGE:
      if (
        template.type !== evaluatorType ||
        template.prompt === null ||
        template.outputDefinition === null
      ) {
        throw new UnrecoverableError(
          "Evaluator template is incomplete for LLM_AS_JUDGE execution",
        );
      }
      return {
        ...template,
        type: evaluatorType,
        prompt: template.prompt,
        outputDefinition: template.outputDefinition,
        sourceCode: null,
        sourceCodeLanguage: null,
      };
    case EvalTemplateType.CODE:
      if (
        template.type !== evaluatorType ||
        template.sourceCode === null ||
        template.sourceCodeLanguage === null
      ) {
        throw new UnrecoverableError(
          "Evaluator template is incomplete for CODE execution",
        );
      }
      return {
        ...template,
        type: evaluatorType,
        prompt: null,
        outputDefinition: null,
        sourceCode: template.sourceCode,
        sourceCodeLanguage: template.sourceCodeLanguage,
      };
    case EvalTemplateType.DECISION_MODEL:
      if (
        template.type !== evaluatorType ||
        template.questions === null ||
        template.questions === undefined
      ) {
        throw new UnrecoverableError(
          "Evaluator template is incomplete for DECISION_MODEL execution",
        );
      }
      return {
        ...template,
        type: evaluatorType,
        prompt: null,
        outputDefinition: null,
        sourceCode: null,
        sourceCodeLanguage: null,
        questions: template.questions,
      };
    case EvalTemplateType.FACET:
      throw new UnrecoverableError("Facets cannot run as evaluators");
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
  event: EvalJobExecutionInput;
}) {
  const { rule, assignment, evaluator, event } = params;
  if (evaluator.blockedAt) {
    return { type: "cancelled" as const, reason: "evaluator-blocked" };
  }
  const version = evaluator.versions[0];
  if (!version) {
    return { type: "cancelled" as const, reason: "version-missing" };
  }
  const organizationId = evaluator.project.orgId;
  // TODO: a transcript code eval is not supported yet. Its empty mapping should be threads.
  const variableMapping =
    assignment?.variableMapping ??
    version.variableMapping ??
    (evaluator.type === EvalTemplateType.CODE && !isTraceTranscriptJob(event)
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
    questions: version.questions,
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
