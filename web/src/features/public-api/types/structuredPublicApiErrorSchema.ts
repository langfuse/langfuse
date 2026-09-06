import { z } from "zod";

const structuredPublicApiErrorCodes = [
  "authentication_failed",
  "access_denied",
  "invalid_request",
  "invalid_query",
  "invalid_body",
  "invalid_filter_value",
  "invalid_json_path",
  "invalid_variable_mapping",
  "missing_variable_mapping",
  "duplicate_variable_mapping",
  "resource_not_found",
  "name_conflict",
  "evaluator_in_use",
  "evaluator_preflight_failed",
  "conflict",
  "unprocessable_content",
  "rate_limited",
  "method_not_allowed",
  "internal_error",
] as const;

const StructuredPublicApiErrorCode = z.enum(structuredPublicApiErrorCodes);

const StructuredPublicApiValidationIssue = z
  .object({
    code: z.string(),
    message: z.string(),
    path: z.array(z.union([z.string(), z.number()])),
  })
  .loose();

export const StructuredPublicApiErrorDetails = z
  .object({
    issues: z.array(StructuredPublicApiValidationIssue).optional(),
    field: z.string().optional(),
    column: z.string().optional(),
    invalidValues: z.array(z.string()).optional(),
    allowedValues: z.array(z.string()).optional(),
    variable: z.string().optional(),
    variables: z.array(z.string()).optional(),
    value: z.string().optional(),
    evaluatorName: z.string().optional(),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    retryAfterSeconds: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional(),
    remaining: z.number().int().nonnegative().optional(),
    resetAt: z.string().optional(),
  })
  .strict();

export const StructuredPublicApiErrorResponse = z
  .object({
    message: z.string(),
    code: StructuredPublicApiErrorCode,
    details: StructuredPublicApiErrorDetails.optional(),
  })
  .strict();

export type StructuredPublicApiErrorCodeType = z.infer<
  typeof StructuredPublicApiErrorCode
>;
export type StructuredPublicApiErrorDetailsType = z.infer<
  typeof StructuredPublicApiErrorDetails
>;
