import { Prisma } from "../../../db";
import { FieldValidationError } from "../../../utils/jsonSchemaValidation";
import { logger } from "../../logger";
import { PayloadError } from "../../repositories/dataset-items";
import { DatasetSchemaValidator } from "./DatasetSchemaValidator";

type ValidateItemResult =
  | { isValid: true }
  | {
      isValid: false;
      inputErrors?: FieldValidationError[];
      expectedOutputErrors?: FieldValidationError[];
    };

type ValidateAndNormalizeResult =
  | {
      success: true;
      input: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
      expectedOutput:
        | Prisma.NullTypes.DbNull
        | Prisma.InputJsonValue
        | undefined;
      metadata: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
    }
  | PayloadError;

/**
 * Validator for dataset item payloads (normalization + schema validation).
 *
 * @internal
 * **This class is internal to DatasetService. Use dataset-items repository methods instead.**
 *
 * **Purpose:**
 * 1. JSON parsing and normalization (strings → objects, control char sanitization)
 * 2. Schema validation against dataset's input/expectedOutput schemas
 *
 * **Performance:** Compiles schemas once in constructor, validates many items with
 * reused validators. Provides 3800x+ speedup over fresh compilation per item.
 *
 * **Used by:** dataset-items repository for all CRUD operations
 *
 * @example
 * // Internal use only - called by dataset-items repository
 * const validator = new DatasetItemValidator({ inputSchema, expectedOutputSchema });
 * for (const item of items) {
 *   const result = validator.preparePayload({ input, expectedOutput, metadata, ... });
 * }
 */
export class DatasetItemValidator {
  private validator: DatasetSchemaValidator;

  constructor(params: {
    inputSchema: Record<string, unknown> | null | undefined;
    expectedOutputSchema: Record<string, unknown> | null | undefined;
  }) {
    // Create validator once - compiles schemas once, validates both fields
    // Even for single item, this is 2x faster than fresh Ajv per field
    this.validator = new DatasetSchemaValidator({
      inputSchema: params.inputSchema,
      expectedOutputSchema: params.expectedOutputSchema,
    });
  }

  /**
   * Remove problematic C0 and C1 control characters from string values.
   * PostgreSQL TEXT columns cannot store NULL byte (\u0000) and other control characters.
   * Preserves common characters like newlines and tabs.
   */
  private cleanControlChars(data: string): string {
    if (!data) return data;

    // Remove control characters:
    // \u0000-\u0008: NULL through backspace
    // \u000B: vertical tab (preserve \n=\u000A, \t=\u0009, \r=\u000D)
    // \u000E-\u001F: shift out through unit separator
    // \u007F-\u009F: DEL + C1 controls
    // eslint-disable-next-line no-control-regex
    return data.replace(/[\u0000-\u0008\u000B\u000E-\u001F\u007F-\u009F]/g, "");
  }

  /**
   * Recursively clean control characters from all string values in a JSON structure.
   * This handles strings within objects and arrays after JSON.parse.
   */
  private sanitizeJsonValue = (data: unknown): unknown => {
    if (typeof data === "string") {
      return this.cleanControlChars(data);
    }
    if (Array.isArray(data)) {
      return data.map(this.sanitizeJsonValue);
    }
    if (data && typeof data === "object") {
      return Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, this.sanitizeJsonValue(v)]),
      );
    }
    return data;
  };

  /**
   * Converts normalized value to Prisma-safe value for database writes.
   * - null → Prisma.DbNull (explicit NULL in DB)
   * - undefined → undefined (skip field in updates)
   * - other → passthrough
   */
  private toPrismaValue(
    value: Prisma.InputJsonValue | null | undefined,
  ): Prisma.InputJsonValue | Prisma.NullTypes.DbNull | undefined {
    return value === null ? Prisma.DbNull : value;
  }

  private normalize(
    data: string | unknown | null | undefined,
    opts?: { sanitizeControlChars?: boolean },
  ): Prisma.InputJsonValue | null | undefined {
    if (data === "") return null;
    if (data === undefined) return undefined;
    if (data === null) return null;

    try {
      // Handle both string (tRPC) and already-parsed values (Public API)
      // InputJsonValue accepts objects, arrays, strings, numbers, booleans, null
      let parsed: Prisma.InputJsonValue;

      if (typeof data === "string") {
        // Try to parse as JSON first (for tRPC which sends JSON strings like '{"key":"value"}')
        try {
          parsed = JSON.parse(data) as Prisma.InputJsonValue;
        } catch {
          // If parsing fails, it's a plain string
          // Store the string as-is
          parsed = data;
        }
      } else {
        // Public API sends already-parsed values - use directly
        parsed = data as Prisma.InputJsonValue;
      }

      if (opts?.sanitizeControlChars) {
        // Sanitize control characters from parsed value before sending to PostgreSQL
        return this.sanitizeJsonValue(parsed) as Prisma.InputJsonValue;
      } else {
        return parsed;
      }
    } catch (e) {
      logger.info(
        "[DatasetItemValidator.normalize] failed to parse dataset item data",
        e,
      );

      return undefined;
    }
  }

  /**
   * Validates dataset item data against schemas (internal use).
   * Expects already-parsed JSON objects, not strings.
   *
   * @param normalizeUndefinedToNull - Set to true for CREATE operations where undefined becomes null in DB
   */
  public validateDatasetItemData(params: {
    input: unknown;
    expectedOutput: unknown;
    normalizeUndefinedToNull?: boolean;
  }): ValidateItemResult {
    // 1. Normalize IO for validation
    const inputToValidate = params.normalizeUndefinedToNull
      ? params.input === undefined || params.input === null
        ? null
        : params.input
      : params.input;

    const outputToValidate = params.normalizeUndefinedToNull
      ? params.expectedOutput === undefined || params.expectedOutput === null
        ? null
        : params.expectedOutput
      : params.expectedOutput;

    // 2. Validate IO against schema
    return this.validator.validateItem({
      input: inputToValidate,
      expectedOutput: outputToValidate,
    });
  }

  /**
   * Normalizes and validates a dataset item payload for database insertion.
   * Combines JSON parsing, control character sanitization, and schema validation.
   *
   * **Flexible input:** Accepts both JSON strings (from tRPC) and already-parsed
   * objects (from Public API). Handles both seamlessly.
   *
   * @param params.input - JSON string, parsed object, or null
   * @param params.expectedOutput - JSON string, parsed object, or null
   * @param params.metadata - JSON string, parsed object, or null
   * @returns Success with normalized data, or error with validation details
   */
  public validateAndNormalize(params: {
    input: string | unknown | null | undefined;
    expectedOutput: string | unknown | null | undefined;
    metadata: string | unknown | null | undefined;
    normalizeOpts?: { sanitizeControlChars?: boolean };
    validateOpts: { normalizeUndefinedToNull?: boolean };
  }): ValidateAndNormalizeResult {
    // If we have a create operation, input cannot be undefined / null
    // Use explicit null check (not falsy) to allow valid JSON values like 0, false, ""
    if (
      params.validateOpts.normalizeUndefinedToNull &&
      (params.input === null || params.input === undefined)
    ) {
      return {
        success: false,
        message: "Dataset item input cannot be null",
        cause: {
          inputErrors: [
            {
              message: "Dataset item input cannot be null",
              path: "/",
            },
          ],
        },
      };
    }

    // 1. Normalize IO
    const normalizedInput = this.normalize(params.input, params.normalizeOpts);
    const normalizedExpectedOutput = this.normalize(
      params.expectedOutput,
      params.normalizeOpts,
    );
    const normalizedMetadata = this.normalize(
      params.metadata,
      params.normalizeOpts,
    );

    // 2. Validate IO against schema
    const result = this.validateDatasetItemData({
      input: normalizedInput,
      expectedOutput: normalizedExpectedOutput,
      normalizeUndefinedToNull: params.validateOpts.normalizeUndefinedToNull,
    });

    if (!result.isValid) {
      const errorMessages: string[] = [];
      if (result.inputErrors) {
        errorMessages.push(
          `Input validation failed: ${result.inputErrors.map((e) => e.message).join(", ")}`,
        );
      }
      if (result.expectedOutputErrors) {
        errorMessages.push(
          `Expected output validation failed: ${result.expectedOutputErrors.map((e) => e.message).join(", ")}`,
        );
      }

      return {
        success: false,
        message: errorMessages.join("; "),
        cause: {
          inputErrors: result.inputErrors,
          expectedOutputErrors: result.expectedOutputErrors,
        },
      };
    }

    return {
      success: true,
      input: this.toPrismaValue(normalizedInput),
      expectedOutput: this.toPrismaValue(normalizedExpectedOutput),
      metadata: this.toPrismaValue(normalizedMetadata),
    };
  }
}
