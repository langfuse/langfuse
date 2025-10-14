const LLMCompletionErrorName = "LLMCompletionError";

export class LLMCompletionError extends Error {
  responseStatusCode: number;

  constructor(params: { message: string; responseStatusCode?: number }) {
    super(params.message);

    this.name = LLMCompletionErrorName;
    this.responseStatusCode = params.responseStatusCode ?? 500;

    Error.captureStackTrace(this);
  }
}

export function isLLMCompletionError(e: any): e is LLMCompletionError {
  return e instanceof Error && e.name === LLMCompletionErrorName;
}
