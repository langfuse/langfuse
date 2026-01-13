import { BaseError } from "./BaseError";

export class NotImplementedError extends BaseError {
  constructor(description = "Not Implemented") {
    super("NotImplementedError", 501, description, true);
  }
}
