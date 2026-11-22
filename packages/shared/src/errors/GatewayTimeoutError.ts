import { BaseError } from "./BaseError";

/** GatewayTimeoutError reports that an upstream service did not respond in time. */
export class GatewayTimeoutError extends BaseError {
  constructor(description = "Gateway Timeout") {
    super("GatewayTimeoutError", 504, description, true);
  }
}
