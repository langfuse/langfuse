import { BaseError } from "./BaseError";

export class ServiceUnavailableError extends BaseError {
  constructor(description = "Service Temporarily Unavailable") {
    super("ServiceUnavailableError", 503, description, true);
  }
}
