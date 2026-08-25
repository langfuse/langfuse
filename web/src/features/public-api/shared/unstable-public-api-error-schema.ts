import { z } from "zod";

export const unstablePublicApiErrorCodes = [
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
  "schema_validation_failed",
  "conflict",
  "unprocessable_content",
  "rate_limited",
  "method_not_allowed",
  "internal_error",
] as const;

export const UnstablePublicApiErrorCode = z.enum(unstablePublicApiErrorCodes);

const UnstablePublicApiValidationIssue = z
  .object({
    code: z.string(),
    message: z.string(),
    path: z.array(z.union([z.string(), z.number()])),
  })
  .loose();

const UnstablePublicApiSchemaValidationFieldError = z
  .object({
    path: z.string(),
    message: z.string(),
    keyword: z.string().optional(),
  })
  .strict();

const UnstablePublicApiSchemaValidationError = z
  .object({
    datasetItemId: z.string(),
    field: z.enum(["input", "expectedOutput"]),
    errors: z.array(UnstablePublicApiSchemaValidationFieldError),
  })
  .strict();

export const UnstablePublicApiErrorDetails = z
  .object({
    issues: z.array(UnstablePublicApiValidationIssue).optional(),
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
    validationErrors: z.array(UnstablePublicApiSchemaValidationError).optional(),
  })
  .strict();

export const UnstablePublicApiErrorResponse = z
  .object({
    message: z.string(),
    code: UnstablePublicApiErrorCode,
    details: UnstablePublicApiErrorDetails.optional(),
  })
  .strict();

export type UnstablePublicApiErrorCodeType = z.infer<
  typeof UnstablePublicApiErrorCode
>;
export type UnstablePublicApiErrorDetailsType = z.infer<
  typeof UnstablePublicApiErrorDetails
>;
