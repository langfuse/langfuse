import { type NextApiResponse } from "next";

import { type BaseError } from "@langfuse/shared";

/** ErrorOrgApiKeyRequired is the 403 message when a non-organization key hits an organization-scoped operation. */
export const ErrorOrgApiKeyRequired =
  "Invalid API key. Organization-scoped API key required for this operation.";

/** writeScimError renders an auth-deny error in the SCIM error envelope. */
export function writeScimError(res: NextApiResponse, error: BaseError): void {
  return res.status(error.httpCode).json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    detail: error.httpCode === 403 ? ErrorOrgApiKeyRequired : error.message,
    status: error.httpCode,
  });
}

/** writeOrgError renders an auth-deny error in the organization error envelope. */
export function writeOrgError(res: NextApiResponse, error: BaseError): void {
  return res.status(error.httpCode).json({
    error: error.httpCode === 403 ? ErrorOrgApiKeyRequired : error.message,
  });
}

/** writeProjectError renders an auth-deny error in the project error envelope. */
export function writeProjectError(
  res: NextApiResponse,
  error: BaseError,
): void {
  return res.status(error.httpCode).json({
    message: error.httpCode === 403 ? ErrorOrgApiKeyRequired : error.message,
  });
}
