import { BaseError } from "./BaseError";

/** TooManyRequestsError reports that a rate limit rejected the request. */
export class TooManyRequestsError extends BaseError {
  constructor(description = "Too Many Requests") {
    super("TooManyRequestsError", 429, description, true);
  }
}
