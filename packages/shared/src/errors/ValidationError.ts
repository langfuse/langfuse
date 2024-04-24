import { BaseError } from "./BaseError";

export class ValidationError extends BaseError {
  constructor(description = "Validation Error") {
    super("ValidationError", 400, description, true);
  }
}
