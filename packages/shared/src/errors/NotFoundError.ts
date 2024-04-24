import { BaseError } from "./BaseError";

export class NotFoundError extends BaseError {
  constructor(description = "Not Found") {
    super("NotFoundError", 404, description, true);
  }
}
