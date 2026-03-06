import { JobConfigSuspendCode } from "@prisma/client";

export type JobConfigSuspendMeta = {
  keyMessage: string | null;
  configMessage: string;
  shortMessage: string;
};

export const JOB_CONFIG_SUSPEND_META: Record<
  JobConfigSuspendCode,
  JobConfigSuspendMeta
> = {
  LLM_401: {
    keyMessage: "LLM API returned 401 Unauthorized. Check your LLM connection.",
    configMessage:
      "Evaluator suspended: LLM API returned 401 Unauthorized. Update the LLM connection used by this evaluator and then reactivate it.",
    shortMessage: "LLM authentication failed (401)",
  },
  LLM_404: {
    keyMessage: null,
    configMessage:
      "Evaluator suspended: model not found (404). Update the evaluator template or the default evaluation model, then reactivate it.",
    shortMessage: "Model not found (404)",
  },
  LLM_ACCOUNT_USE_CASE_NOT_SUBMITTED: {
    keyMessage: null,
    configMessage:
      "Evaluator suspended: model use case not submitted for this account. Complete the provider's use case details and then reactivate the evaluator.",
    shortMessage: "Model use case not submitted for this account",
  },
  LLM_INVALID_RESPONSE: {
    keyMessage: null,
    configMessage:
      "Evaluator suspended: LLM returned an invalid response. Check the evaluator template and model, then reactivate it.",
    shortMessage: "LLM returned an invalid response",
  },
  LLM_KEY_MISSING: {
    keyMessage: null,
    configMessage:
      "Evaluator suspended: no LLM connection found for the provider used by this evaluator. Add or restore the LLM connection, then reactivate it.",
    shortMessage: "LLM connection not found",
  },
  MODEL_CONFIG_MISSING: {
    keyMessage: null,
    configMessage:
      "Evaluator suspended: no valid evaluation model is configured. Set a model on the evaluator template or configure a default evaluation model, then reactivate it.",
    shortMessage: "No evaluation model configured",
  },
  DEFAULT_MODEL_REMOVED: {
    keyMessage: null,
    configMessage:
      "Evaluator suspended: the shared default evaluation model was removed. Set a new default model or update the evaluator template, then reactivate it.",
    shortMessage: "Default evaluation model removed",
  },
  ERROR: {
    keyMessage: null,
    configMessage:
      "Evaluator suspended: an unrecoverable error occurred. Check the evaluator configuration and then reactivate it.",
    shortMessage: "An error occurred",
  },
};

export const EVAL_SUSPEND_EMAIL_DEBOUNCE_MS = 60 * 60 * 1000;

export function getJobConfigSuspendMeta(
  suspendCode: JobConfigSuspendCode,
): JobConfigSuspendMeta {
  return JOB_CONFIG_SUSPEND_META[suspendCode];
}

export function getEvalSuspendResolutionPath(params: {
  projectId: string;
  suspendCode: JobConfigSuspendCode;
  templateId?: string | null;
}): string {
  const { projectId, suspendCode, templateId } = params;

  if (
    suspendCode === JobConfigSuspendCode.LLM_401 ||
    suspendCode === JobConfigSuspendCode.LLM_KEY_MISSING ||
    suspendCode === JobConfigSuspendCode.LLM_ACCOUNT_USE_CASE_NOT_SUBMITTED
  ) {
    return `/project/${projectId}/settings/llm-connections`;
  }

  if (templateId) {
    return `/project/${projectId}/evals/templates/${templateId}`;
  }

  return `/project/${projectId}/evals`;
}
