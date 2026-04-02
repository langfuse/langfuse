import {
  EvaluatorBlockReason,
  JobConfigState,
  JobExecutionStatus,
} from "@prisma/client";

export const PausedEvaluatorDisplayState = "PAUSED" as const;
export type PausedEvaluatorDisplayState = typeof PausedEvaluatorDisplayState;

export type EvaluatorDisplayState =
  | JobConfigState
  | PausedEvaluatorDisplayState
  | "FINISHED";

export type EvaluatorExecutionStatusCount = {
  status: JobExecutionStatus;
  count: number;
};

export type EvaluatorExecutionCountsByEvaluatorId = Record<
  string,
  EvaluatorExecutionStatusCount[]
>;

type BlockStateLike = {
  status: JobConfigState;
  blockedAt?: Date | null;
};

export function isJobConfigBlocked(config: Pick<BlockStateLike, "blockedAt">) {
  return config.blockedAt != null;
}

export function isJobConfigExecutable(config: BlockStateLike) {
  return config.status === JobConfigState.ACTIVE && !isJobConfigBlocked(config);
}

type EvaluatorBlockMetadata = {
  message: string;
  shortLabel: string;
};

export const EVALUATOR_BLOCK_METADATA: Record<
  EvaluatorBlockReason,
  EvaluatorBlockMetadata
> = {
  LLM_CONNECTION_AUTH_INVALID: {
    message:
      "Evaluator paused: LLM authentication failed. Update the LLM connection used by this evaluator and then reactivate it.",
    shortLabel: "Authentication failed",
  },
  LLM_CONNECTION_MISSING: {
    message:
      "Evaluator paused: no LLM connection found for the provider used by this evaluator. Add or restore the LLM connection, then reactivate it.",
    shortLabel: "LLM connection missing",
  },
  DEFAULT_EVAL_MODEL_MISSING: {
    message:
      "Evaluator paused: no default evaluation model is configured. Set a default evaluation model or update the evaluator template, then reactivate it.",
    shortLabel: "Default evaluation model missing",
  },
  EVAL_MODEL_CONFIG_INVALID: {
    message:
      "Evaluator paused: no valid evaluation model is configured. Update the evaluator template or default evaluation model, then reactivate it.",
    shortLabel: "Evaluation model invalid",
  },
  EVAL_MODEL_UNAVAILABLE: {
    message:
      "Evaluator paused: model not found or unavailable. Update the evaluator template or default evaluation model, then reactivate it.",
    shortLabel: "Model unavailable",
  },
  PROVIDER_ACCOUNT_NOT_READY: {
    message:
      "Evaluator paused: provider account setup is incomplete. Complete the provider setup and then reactivate the evaluator.",
    shortLabel: "Provider account setup incomplete",
  },
};

export function getEvaluatorBlockMetadata(
  reason: EvaluatorBlockReason,
): EvaluatorBlockMetadata {
  return EVALUATOR_BLOCK_METADATA[reason];
}

export function getEvaluatorBlockResolutionPath(params: {
  projectId: string;
  blockReason: EvaluatorBlockReason;
  templateId?: string | null;
}): string {
  const { projectId, blockReason, templateId } = params;

  if (
    blockReason === EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID ||
    blockReason === EvaluatorBlockReason.LLM_CONNECTION_MISSING
  ) {
    return `/project/${projectId}/settings/llm-connections`;
  }

  if (templateId) {
    return `/project/${projectId}/evals/templates/${templateId}`;
  }

  return `/project/${projectId}/evals`;
}

export function getBlockReasonForInvalidModelConfig(params: {
  templateProvider?: string | null;
  templateModel?: string | null;
  error: string;
}): EvaluatorBlockReason {
  const { templateProvider, templateModel, error } = params;

  if (error.includes("API key for provider")) {
    return EvaluatorBlockReason.LLM_CONNECTION_MISSING;
  }

  if (!templateProvider || !templateModel) {
    return EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING;
  }

  return EvaluatorBlockReason.EVAL_MODEL_CONFIG_INVALID;
}

export function deriveEvaluatorDisplayState(params: {
  status: JobConfigState;
  blockedAt?: Date | null;
  timeScope: string[];
  hasPendingJobs: boolean;
  totalJobCount: number;
}): EvaluatorDisplayState {
  const { status, blockedAt, timeScope, hasPendingJobs, totalJobCount } =
    params;

  if (status === JobConfigState.INACTIVE) {
    return JobConfigState.INACTIVE;
  }

  if (blockedAt) {
    return PausedEvaluatorDisplayState;
  }

  if (
    timeScope.length === 1 &&
    timeScope[0] === "EXISTING" &&
    !hasPendingJobs &&
    totalJobCount > 0
  ) {
    return "FINISHED";
  }

  return JobConfigState.ACTIVE;
}

export function deriveEvaluatorDisplayStateFromExecutionCounts(params: {
  status: JobConfigState;
  blockedAt?: Date | null;
  timeScope: string[];
  executionCounts?: EvaluatorExecutionStatusCount[];
}): EvaluatorDisplayState {
  const { status, blockedAt, timeScope, executionCounts = [] } = params;

  return deriveEvaluatorDisplayState({
    status,
    blockedAt,
    timeScope,
    hasPendingJobs: executionCounts.some(
      (executionCount) => executionCount.status === JobExecutionStatus.PENDING,
    ),
    totalJobCount: executionCounts.reduce(
      (total, executionCount) => total + executionCount.count,
      0,
    ),
  });
}
