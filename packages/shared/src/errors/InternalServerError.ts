import { BaseError } from "./BaseError";

export class InternalServerError extends BaseError {
  constructor(description = "Internal Server Error") {
    super("InternalServerError", 500, description, true);
  }
}
