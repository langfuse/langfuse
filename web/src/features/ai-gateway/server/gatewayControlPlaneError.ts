export class GatewayControlPlaneError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 503,
  ) {
    super(message);
  }
}
