import { BaseError } from "./BaseError";

export class InvalidRequestError extends BaseError {
  constructor(description = "Invalid Request Error") {
    super("InvalidRequestError", 400, description, true);
  }
}
