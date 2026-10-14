import { type NextApiResponse } from "next";

import { type BaseError, ServiceUnavailableError } from "@langfuse/shared";

/** writeScimError renders an auth-deny error in the SCIM error envelope. */
export function writeScimError(res: NextApiResponse, error: BaseError): void {
  return res.status(error.httpCode).json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    detail: error.message,
    status: error.httpCode,
  });
}

/** writeOrgError renders an auth-deny error in the organization error envelope. */
export function writeOrgError(res: NextApiResponse, error: BaseError): void {
  return res.status(error.httpCode).json({
    error: error.message,
  });
}

/** writeProjectError renders an auth-deny error in the project error envelope. */
export function writeProjectError(
  res: NextApiResponse,
  error: BaseError,
): void {
  return res.status(error.httpCode).json({
    message: error.message,
  });
}

/** setRetryAfterHeader forwards a ServiceUnavailableError's retry hint as `Retry-After`. */
export function setRetryAfterHeader(
  res: NextApiResponse,
  error: unknown,
): void {
  if (
    error instanceof ServiceUnavailableError &&
    error.retryAfterSeconds !== undefined
  ) {
    res.setHeader("Retry-After", String(error.retryAfterSeconds));
  }
}
