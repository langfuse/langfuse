import Ajv, { AnySchema } from "ajv";
import addFormats from "ajv-formats";

/**
 * Creates a fresh Ajv instance for validation
 * Using a fresh instance for each validation prevents memory leaks from cached compiled schemas
 */
export const createAjvInstance = () => {
  const ajv = new Ajv({
    strict: false,
    allErrors: true, // Return all errors, not just first
    verbose: true,
  });
  addFormats(ajv);

  return ajv;
};

/**
 * Validates if a given object is a valid JSON Schema
 * Used by Zod schema validation
 * Can be used in both client and server contexts
 */
export function isValidJSONSchema(schema: unknown): boolean {
  try {
    const ajv = createAjvInstance();
    // This will throw an error if the schema is invalid
    ajv.compile(schema as AnySchema);

    return true;
  } catch (e) {
    return false;
  }
}

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
 * Validates a single field against a JSON schema
 * Creates a fresh Ajv instance for each validation to prevent memory leaks
 * Can be used in both client and server contexts
 */
export function validateFieldAgainstSchema(params: {
  data: unknown;
  schema: Record<string, unknown>;
}): FieldValidationResult {
  const { data, schema } = params;
  const ajv = createAjvInstance();
  const validate = ajv.compile(schema);
  const isValid = validate(data);

  if (!isValid && validate.errors) {
    return {
      isValid: false,
      errors: validate.errors.map((err) => ({
        path: err.instancePath || "/",
        message: err.message || "Validation failed",
        keyword: err.keyword,
      })),
    };
  }

  return { isValid: true };
}
