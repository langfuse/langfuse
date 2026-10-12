import { BaseError } from "./BaseError";

export class ServiceUnavailableError extends BaseError {
  /** Sent as the `Retry-After` response header when set. */
  public readonly retryAfterSeconds?: number;

  constructor(
    description = "Service Temporarily Unavailable",
    options?: { retryAfterSeconds?: number },
  ) {
    super("ServiceUnavailableError", 503, description, true);
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}
