export class GatewayControlPlaneError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 429 | 503,
    readonly code?:
      | "model_not_allowed"
      | "invalid_gateway_authorization"
      | "rate_limit_exceeded",
  ) {
    super(message);
  }
}
