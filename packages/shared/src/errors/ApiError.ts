import { BaseError } from "./BaseError";

export class ApiError extends BaseError {
  constructor(description = "Api call failed") {
    super("ApiError", 500, description, true);
  }
}
