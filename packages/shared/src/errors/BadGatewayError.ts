import { BaseError } from "./BaseError";

/** BadGatewayError reports an invalid response from an upstream service. */
export class BadGatewayError extends BaseError {
  constructor(description = "Bad Gateway") {
    super("BadGatewayError", 502, description, true);
  }
}
