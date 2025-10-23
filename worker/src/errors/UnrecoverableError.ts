const UnrecoverableErrorName = "UnrecoverableError";

export class UnrecoverableError extends Error {
  constructor(message: string) {
    super(message);

    this.name = UnrecoverableErrorName;

    Error.captureStackTrace(this);
  }
}

export function isUnrecoverableError(e: any): e is UnrecoverableError {
  return e instanceof Error && e.name === UnrecoverableErrorName;
}
