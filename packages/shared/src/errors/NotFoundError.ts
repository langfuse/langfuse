import { BaseError } from "./BaseError";

export class LangfuseNotFoundError extends BaseError {
  constructor(description = "Not Found") {
    super("LangfuseNotFoundError", 404, description, true);
  }
}
