import { BaseError } from "./BaseError";

export class MethodNotAllowedError extends BaseError {
  constructor(description = "Method not allowed") {
    super("MethodNotAllowedError", 405, description, true);
  }
}
