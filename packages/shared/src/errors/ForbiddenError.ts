import { BaseError } from "./BaseError";

export class ForbiddenError extends BaseError {
  constructor(
    description = "Access denied. You do not have permission to access this resource.",
  ) {
    super("ForbiddenError", 403, description, true);
  }
}
