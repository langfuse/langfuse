import { BaseError } from "./BaseError";

export class UnauthorizedError extends BaseError {
  constructor(description = "Unauthorized") {
    super("UnauthorizedError", 401, description, true);
  }
}
