import Ajv, { AnySchema, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

export type FieldValidationError = {
  path: string;
  message: string;
  keyword?: string;
};

export type FieldValidationResult =
  | {
      isValid: true;
    }
  | {
      isValid: false;
      errors: FieldValidationError[];
    };

/**
 * Creates a fresh Ajv instance for validation
 */
export const createAjvInstanceInternal = () => {
  const ajv = new Ajv({
    strict: true,
    allErrors: false, // Return only the first error, not all
    code: { optimize: true }, // Enable code optimization to improve performance and reduce DoS risk
    validateFormats: false, // Prevent ReDoS via format validators
  });
  addFormats(ajv); // Formats added but not validated

  return ajv;
};

/**
 * Validates if a given object is a valid JSON Schema
 * Used by Zod schema validation
 * Can be used in both client and server contexts
 */
export function isValidJSONSchema(schema: unknown): boolean {
  try {
    const stringified = JSON.stringify(schema);
    if (stringified.length > 10_000) return false; // Schema too large

    const ajv = createAjvInstanceInternal();
    // This will throw an error if the schema is invalid
    ajv.compile(schema as AnySchema);

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates data against a compiled schema validator
 * Optimized for reuse - compiles schema once, validates many times
 */
export function validateWithCompiledSchema(
  data: unknown,
  validator: ValidateFunction,
): FieldValidationResult {
  const isValid = validator(data);

  if (!isValid && validator.errors) {
    return {
      isValid: false,
      errors: validator.errors.map((err) => ({
        path: err.instancePath || "/",
        message: err.message || "Validation failed",
        keyword: err.keyword,
      })),
    };
  }

  return { isValid: true };
}

/**
 * Validates a single field against a JSON schema
 * Creates a fresh Ajv instance for each validation
 * Use this for one-off validations (e.g., single item create/update)
 */
export function validateFieldAgainstSchema(params: {
  data: unknown;
  schema: Record<string, unknown>;
}): FieldValidationResult {
  const { data, schema } = params;
  const ajv = createAjvInstanceInternal();
  const validate = ajv.compile(schema);
  return validateWithCompiledSchema(data, validate);
}
