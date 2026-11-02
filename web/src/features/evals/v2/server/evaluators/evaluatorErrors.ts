import { BaseError, LangfuseConflictError } from "@langfuse/shared";

export class EvaluatorVersionConflictError extends LangfuseConflictError {
  constructor() {
    super("Evaluator was updated concurrently. Retry the request.");
  }
}

export class EvaluatorConfigurationError extends BaseError {
  constructor(message: string) {
    super("EvaluatorConfigurationError", 412, message, true);
  }
}

/** A structurally valid evaluator whose LLM model cannot currently resolve. */
export class EvaluatorModelConfigurationError extends EvaluatorConfigurationError {}
