import { BaseError } from "./BaseError";

export class LangfuseConflictError extends BaseError {
  constructor(description = "Conflict") {
    super("LangfuseConflictError", 409, description, true);
  }
}
