import {
  applyCommentFilters,
  buildEvalExecutionData,
  createW3CTraceId,
  extractObservationVariables,
  getEventsStreamForEval,
  resolveConfiguredCodeEvalDispatcher,
  runCodeBasedEvaluationDispatch,
  writeInternalTraceViaOtelIngestion,
  type CodeEvalUserVisibleError,
  type DispatchResult,
} from "@langfuse/shared/src/server";

import {
  observationForEvalSchema,
  type EvalTargetObject,
  type FilterCondition,
  type ObservationForEval,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { EvalTemplateType, type PrismaClient } from "@langfuse/shared/src/db";
import { getObservationForEvalById } from "@/src/features/evals/server/getObservationForEvalById";
import { getExperimentEvalPreviewFilters } from "@/src/features/evals/utils/experiment-eval-preview-utils";
import {
  isEventTarget,
  isExperimentTarget,
} from "@/src/features/evals/utils/typeHelpers";
import { isCodeEvalSourceCodeLanguageSupported } from "@/src/features/evals/server/isCodeEvalEnabled";
import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";

type CodeEvalTestRunDispatchError = Omit<CodeEvalUserVisibleError, "retryable">;

type CodeEvalTestRunSetupErrorCode =
  | "DISPATCHER_NOT_CONFIGURED"
  | "TEMPLATE_NOT_FOUND"
  | "UNSUPPORTED_LANGUAGE"
  | "INVALID_TARGET";

export class CodeEvalTestRunSetupError extends Error {
  constructor(
    readonly code: CodeEvalTestRunSetupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CodeEvalTestRunSetupError";
    Object.setPrototypeOf(this, CodeEvalTestRunSetupError.prototype);
  }
}

export type CodeEvalTestRunResult =
  | {
      success: true;
      result: DispatchResult;
      executionTraceId: string;
      executionTraceFromTimestamp: Date;
    }
  | {
      success: false;
      error: CodeEvalTestRunDispatchError;
      executionTraceId: string;
      executionTraceFromTimestamp: Date;
    };

export async function runCodeEvalTest(params: {
  prisma: PrismaClient;
  orgId: string;
  projectId: string;
  evalTemplateId: string;
  target: EvalTargetObject;
  mapping: ObservationVariableMapping[];
  scoreName: string;
  observationId: string;
  traceId: string;
  startTime: Date;
  shouldReadFromObservationsTable?: boolean;
}): Promise<CodeEvalTestRunResult> {
  const observation = await getObservationForEvalById({
    projectId: params.projectId,
    id: params.observationId,
    traceId: params.traceId,
    startTime: params.startTime,
    shouldReadFromObservationsTable: params.shouldReadFromObservationsTable,
  });

  return runCodeEvalTestForObservation({
    ...params,
    observation,
  });
}

export async function runCodeEvalTestForJobConfig(params: {
  prisma: PrismaClient;
  orgId: string;
  projectId: string;
  evalTemplateId: string;
  target: EvalTargetObject;
  mapping: ObservationVariableMapping[];
  scoreName: string;
  filter: FilterCondition[] | null;
}): Promise<CodeEvalTestRunResult | null> {
  const observation = await getObservationForEvalByFilter({
    prisma: params.prisma,
    projectId: params.projectId,
    target: params.target,
    filter: params.filter,
  });

  if (!observation) {
    return null;
  }

  return runCodeEvalTestForObservation({
    ...params,
    observation,
  });
}

export async function runCodeEvalTestForEvaluationRule(params: {
  prisma: PrismaClient;
  orgId: string;
  projectId: string;
  evaluatorId: string;
  target: EvalTargetObject;
  mapping: ObservationVariableMapping[];
  scoreName: string;
  filter: FilterCondition[] | null;
}): Promise<CodeEvalTestRunResult | null> {
  const observation = await getObservationForEvalByFilter({
    prisma: params.prisma,
    projectId: params.projectId,
    target: params.target,
    filter: params.filter,
  });

  if (!observation) return null;

  const evaluator = await params.prisma.evaluator.findFirst({
    where: {
      id: params.evaluatorId,
      projectId: params.projectId,
      type: EvalTemplateType.CODE,
    },
    include: {
      versions: {
        where: { sourceCode: { not: null }, sourceCodeLanguage: { not: null } },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  const version = evaluator?.versions[0];
  if (!evaluator || !version?.sourceCode || !version.sourceCodeLanguage) {
    throw new CodeEvalTestRunSetupError(
      "TEMPLATE_NOT_FOUND",
      "Evaluator not found",
    );
  }

  return runCodeEvalTestForObservationWithEvaluator({
    ...params,
    observation,
    evaluator,
    version: {
      ...version,
      sourceCode: version.sourceCode,
      sourceCodeLanguage: version.sourceCodeLanguage,
    },
    evaluatorMetadata: {
      evaluator_version: version.version,
    },
  });
}

async function runCodeEvalTestForObservation(params: {
  prisma: PrismaClient;
  orgId: string;
  projectId: string;
  evalTemplateId: string;
  target: EvalTargetObject;
  mapping: ObservationVariableMapping[];
  scoreName: string;
  observation: ObservationForEval;
}): Promise<CodeEvalTestRunResult> {
  const managedKey = params.evalTemplateId.startsWith("managed:")
    ? params.evalTemplateId.slice("managed:".length)
    : null;
  const managedTemplate = managedKey
    ? MANAGED_TEMPLATES_CATALOG.templates.find(
        (template) =>
          template.key === managedKey &&
          template.evaluator.type === EvalTemplateType.CODE,
      )
    : null;
  const storedVersion = managedTemplate
    ? null
    : await params.prisma.evaluatorVersion.findFirst({
        where: {
          id: params.evalTemplateId,
          evaluator: {
            projectId: params.projectId,
            type: EvalTemplateType.CODE,
          },
          sourceCode: { not: null },
          sourceCodeLanguage: { not: null },
        },
        include: { evaluator: true },
      });
  const codeTemplate =
    managedTemplate?.evaluator.type === EvalTemplateType.CODE
      ? {
          id: params.evalTemplateId,
          name: managedTemplate.name,
          version: 1,
          sourceCode: managedTemplate.evaluator.source,
          sourceCodeLanguage: managedTemplate.evaluator.language,
        }
      : storedVersion?.sourceCode && storedVersion.sourceCodeLanguage
        ? {
            id: storedVersion.evaluator.id,
            name: storedVersion.evaluator.name,
            version: storedVersion.version,
            sourceCode: storedVersion.sourceCode,
            sourceCodeLanguage: storedVersion.sourceCodeLanguage,
          }
        : null;

  if (!codeTemplate) {
    throw new CodeEvalTestRunSetupError(
      "TEMPLATE_NOT_FOUND",
      "Evaluator template not found",
    );
  }

  if (!isCodeEvalSourceCodeLanguageSupported(codeTemplate.sourceCodeLanguage)) {
    throw new CodeEvalTestRunSetupError(
      "UNSUPPORTED_LANGUAGE",
      "This code evaluator language is not supported by the configured dispatcher.",
    );
  }

  return runCodeEvalTestForObservationWithEvaluator({
    ...params,
    evaluator: codeTemplate,
    version: codeTemplate,
    evaluatorMetadata: {
      evaluator_version: codeTemplate.version,
    },
  });
}

async function runCodeEvalTestForObservationWithEvaluator(params: {
  orgId: string;
  projectId: string;
  target: EvalTargetObject;
  mapping: ObservationVariableMapping[];
  scoreName: string;
  observation: ObservationForEval;
  evaluator: { id: string; name: string };
  version: {
    version: number;
    sourceCode: string;
    sourceCodeLanguage: "PYTHON" | "TYPESCRIPT";
  };
  evaluatorMetadata: Record<string, unknown>;
}): Promise<CodeEvalTestRunResult> {
  const dispatcher = resolveConfiguredCodeEvalDispatcher();
  if (!dispatcher) {
    throw new CodeEvalTestRunSetupError(
      "DISPATCHER_NOT_CONFIGURED",
      "Code eval dispatcher is not configured",
    );
  }

  if (
    !isCodeEvalSourceCodeLanguageSupported(params.version.sourceCodeLanguage)
  ) {
    throw new CodeEvalTestRunSetupError(
      "UNSUPPORTED_LANGUAGE",
      "This code evaluator language is not supported by the configured dispatcher.",
    );
  }

  const extractedVariables = extractObservationVariables({
    observation: params.observation,
    variableMapping: params.mapping,
  });
  const executionTraceId = createW3CTraceId();
  const traceName = `Test evaluator: ${params.evaluator.name}`;
  const evaluationData = buildEvalExecutionData({
    type: "TEST",
    evaluatorId: params.evaluator.id,
    targetTraceId: params.observation.trace_id,
    targetObservationId: params.observation.span_id,
  });
  const executionMetadata = {
    dispatcher_name: dispatcher.name,
    code_eval_runtime: params.version.sourceCodeLanguage,
    ...params.evaluatorMetadata,
    ...evaluationData.executionMetadata,
    score_name: params.scoreName,
    target_object: params.target,
  };
  const dispatchOutcome = await runCodeBasedEvaluationDispatch({
    dispatcher,
    organizationId: params.orgId,
    projectId: params.projectId,
    executionTraceId,
    jobExecutionId: executionTraceId,
    evaluator: params.evaluator,
    version: params.version,
    extractedVariables,
    hasExperimentContext: Boolean(params.observation.experiment_id),
    traceName,
    metadata: executionMetadata,
    evaluationContext: evaluationData.evaluationContext,
    writeTrace: writeInternalTraceViaOtelIngestion,
  });

  if (dispatchOutcome.success) {
    return {
      success: true,
      result: dispatchOutcome.result,
      executionTraceId: dispatchOutcome.executionTraceId,
      executionTraceFromTimestamp: dispatchOutcome.executionTraceFromTimestamp,
    };
  }

  return {
    success: false,
    error: toCodeEvalTestRunError(dispatchOutcome.error),
    executionTraceId: dispatchOutcome.executionTraceId,
    executionTraceFromTimestamp: dispatchOutcome.executionTraceFromTimestamp,
  };
}

function toCodeEvalTestRunError({
  retryable: _retryable,
  ...error
}: CodeEvalUserVisibleError): CodeEvalTestRunDispatchError {
  return error;
}

async function getObservationForEvalByFilter(params: {
  prisma: PrismaClient;
  projectId: string;
  target: EvalTargetObject;
  filter: FilterCondition[] | null;
}): Promise<ObservationForEval | null> {
  if (!isEventTarget(params.target) && !isExperimentTarget(params.target)) {
    throw new CodeEvalTestRunSetupError(
      "INVALID_TARGET",
      "Code evaluators can only run on observations or experiments.",
    );
  }

  const filter = isExperimentTarget(params.target)
    ? getExperimentEvalPreviewFilters(params.filter)
    : params.filter;

  const { filterState, hasNoMatches } = await applyCommentFilters({
    filterState: filter ?? [],
    prisma: params.prisma,
    projectId: params.projectId,
    objectType: "OBSERVATION",
  });

  if (hasNoMatches) {
    return null;
  }

  const stream = await getEventsStreamForEval({
    projectId: params.projectId,
    filter: filterState,
    rowLimit: 1,
  });

  for await (const row of stream) {
    return observationForEvalSchema.parse(row);
  }

  return null;
}
