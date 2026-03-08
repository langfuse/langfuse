import { JobConfigBlockReason, JobConfigState } from "@prisma/client";

export const PausedEvaluatorStatus = "PAUSED" as const;
export type PausedEvaluatorStatus = typeof PausedEvaluatorStatus;

export type EvaluatorDisplayStatus =
  | JobConfigState
  | PausedEvaluatorStatus
  | "FINISHED";

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

type BlockMeta = {
  message: string;
  shortLabel: string;
};

export const JOB_CONFIG_BLOCK_META: Record<JobConfigBlockReason, BlockMeta> = {
  CONNECTION_AUTH_INVALID: {
    message:
      "Evaluator paused: LLM authentication failed. Update the LLM connection used by this evaluator and then reactivate it.",
    shortLabel: "Authentication failed",
  },
  CONNECTION_MISSING: {
    message:
      "Evaluator paused: no LLM connection found for the provider used by this evaluator. Add or restore the LLM connection, then reactivate it.",
    shortLabel: "LLM connection missing",
  },
  DEFAULT_MODEL_MISSING: {
    message:
      "Evaluator paused: no default evaluation model is configured. Set a default evaluation model or update the evaluator template, then reactivate it.",
    shortLabel: "Default evaluation model missing",
  },
  MODEL_CONFIG_INVALID: {
    message:
      "Evaluator paused: no valid evaluation model is configured. Update the evaluator template or default evaluation model, then reactivate it.",
    shortLabel: "Evaluation model invalid",
  },
  MODEL_UNAVAILABLE: {
    message:
      "Evaluator paused: model not found or unavailable. Update the evaluator template or default evaluation model, then reactivate it.",
    shortLabel: "Model unavailable",
  },
  PROVIDER_ACCOUNT_UNREADY: {
    message:
      "Evaluator paused: provider account setup is incomplete. Complete the provider setup and then reactivate the evaluator.",
    shortLabel: "Provider account setup incomplete",
  },
};

export function getJobConfigBlockMeta(reason: JobConfigBlockReason): BlockMeta {
  return JOB_CONFIG_BLOCK_META[reason];
}

export function getEvalBlockResolutionPath(params: {
  projectId: string;
  blockReason: JobConfigBlockReason;
  templateId?: string | null;
}): string {
  const { projectId, blockReason, templateId } = params;

  if (
    blockReason === JobConfigBlockReason.CONNECTION_AUTH_INVALID ||
    blockReason === JobConfigBlockReason.CONNECTION_MISSING
  ) {
    return `/project/${projectId}/settings/llm-connections`;
  }

  if (templateId) {
    return `/project/${projectId}/evals/templates/${templateId}`;
  }

  return `/project/${projectId}/evals`;
}

export function inferJobConfigBlockReasonFromInvalidModelConfig(params: {
  templateProvider?: string | null;
  templateModel?: string | null;
  error: string;
}): JobConfigBlockReason {
  const { templateProvider, templateModel, error } = params;

  if (error.includes("API key for provider")) {
    return JobConfigBlockReason.CONNECTION_MISSING;
  }

  if (!templateProvider || !templateModel) {
    return JobConfigBlockReason.DEFAULT_MODEL_MISSING;
  }

  return JobConfigBlockReason.MODEL_CONFIG_INVALID;
}

export function getEvaluatorDisplayStatus(params: {
  status: JobConfigState;
  blockedAt?: Date | null;
  timeScope: string[];
  hasPendingJobs: boolean;
  totalJobCount: number;
}): EvaluatorDisplayStatus {
  const { status, blockedAt, timeScope, hasPendingJobs, totalJobCount } =
    params;

  if (status === JobConfigState.INACTIVE) {
    return JobConfigState.INACTIVE;
  }

  if (blockedAt) {
    return PausedEvaluatorStatus;
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
