import { BaseError } from "@langfuse/shared";

export class EvaluatorVersionConflictError extends BaseError {
  constructor() {
    super(
      "EvaluatorVersionConflictError",
      409,
      "Evaluator was updated concurrently. Retry the request.",
      true,
    );
  }
}

export class EvaluatorConfigurationError extends BaseError {
  constructor(message: string) {
    super("EvaluatorConfigurationError", 412, message, true);
  }
}
