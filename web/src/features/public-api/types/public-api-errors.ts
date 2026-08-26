import { z } from "zod";
import { UnstablePublicApiErrorDetails } from "@/src/features/public-api/shared/structured-public-api-error-schema";

export const publicApiErrorCodes = [
  "authentication_failed",
  "access_denied",
  "invalid_request",
  "invalid_query",
  "invalid_body",
  "resource_not_found",
  "conflict",
  "rate_limited",
  "method_not_allowed",
  "internal_error",
] as const;

export const PublicApiErrorCode = z.enum(publicApiErrorCodes);

export const PublicApiError = z
  .object({
    message: z.string(),
    code: PublicApiErrorCode,
    details: UnstablePublicApiErrorDetails.optional(),
  })
  .strict();
