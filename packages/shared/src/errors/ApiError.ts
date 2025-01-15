import { BaseError } from "./BaseError";

export class ApiError extends BaseError {
  constructor(description = "Api call failed", status = 500) {
    super("ApiError", status, description, true);
  }
}
