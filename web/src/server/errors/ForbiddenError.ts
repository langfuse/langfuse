import { BaseError } from "./BaseError";

export class ForbiddenError extends BaseError {
  constructor(description = "Forbidden") {
    super("ForbiddenError", 403, description, true);
  }
}
