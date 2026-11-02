export class BackgroundExecutionConnectionError extends Error {
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { retryable: boolean; cause?: unknown },
  ) {
    super(message, options.cause === undefined ? undefined : options);
    this.retryable = options.retryable;
  }
}
