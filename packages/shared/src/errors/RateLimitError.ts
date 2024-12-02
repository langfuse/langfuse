import { BaseError } from "./BaseError";

export class RateLimitError extends BaseError {
  constructor(description = "Rate limit exceeded") {
    super("RateLimitError", 429, description, true);
  }
}
