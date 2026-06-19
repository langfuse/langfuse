import { BaseError } from "./BaseError";

export class PayloadTooLargeError extends BaseError {
  constructor(description = "Response payload is too large") {
    super("PayloadTooLargeError", 413, description, true);
  }
}
