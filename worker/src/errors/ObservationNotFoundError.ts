const ObservationNotFoundErrorName = "ObservationNotFoundError";

export class ObservationNotFoundError extends Error {
  observationId: string;

  constructor(params: { message: string; observationId: string }) {
    super(params.message);

    this.name = ObservationNotFoundErrorName;
    this.observationId = params.observationId;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }
  }
}

export function isObservationNotFoundError(
  e: any,
): e is ObservationNotFoundError {
  return e instanceof Error && e.name === ObservationNotFoundErrorName;
}
