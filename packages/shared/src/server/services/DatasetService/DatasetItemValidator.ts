import { Prisma } from "../../../db";
import { logger } from "../../logger";
import { DatasetSchemaValidator } from "./DatasetSchemaValidator";
import type { FieldValidationError, PreparePayloadResult } from "./types";

type ValidateItemResult =
  | { isValid: true }
  | {
      isValid: false;
      inputErrors?: FieldValidationError[];
      expectedOutputErrors?: FieldValidationError[];
    };

export class DatasetItemValidator {
  private inputSchema: Record<string, unknown> | null | undefined;
  private expectedOutputSchema: Record<string, unknown> | null | undefined;

  constructor(params: {
    inputSchema: Record<string, unknown> | null | undefined;
    expectedOutputSchema: Record<string, unknown> | null | undefined;
  }) {
    this.inputSchema = params.inputSchema;
    this.expectedOutputSchema = params.expectedOutputSchema;
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
    return data.replace(/[\u0000-\u0008\u000B\u000E-\u001F\u007F-\u009F]/g, "");
  }

  /**
   * Recursively clean control characters from all string values in a JSON structure.
   * This handles strings within objects and arrays after JSON.parse.
   */
  private sanitizeJsonValue(data: unknown): unknown {
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
  }

  private normalize(data: string | null | undefined) {
    if (data === "") return Prisma.DbNull;

    try {
      const parsed = !!data ? JSON.parse(data) : undefined;
      // Sanitize control characters from parsed object before sending to PostgreSQL
      return parsed
        ? (this.sanitizeJsonValue(parsed) as Prisma.InputJsonObject)
        : undefined;
    } catch (e) {
      logger.info(
        "[DatasetItemValidator.normalize] failed to parse dataset item data",
        e,
      );

      return undefined;
    }
  }

  /**
   * Core validation logic - validates dataset item data
   * Works with already-parsed JSON (not strings)
   * Used by both tRPC and Public API
   *
   * Performance optimized: compiles schemas once, validates both fields with reused validators
   * Provides 2x speedup even for single item validation
   *
   * @param normalizeUndefinedToNull - Set to true for CREATE operations where undefined becomes null in DB
   */
  public validateDatasetItemData(params: {
    input: unknown;
    expectedOutput: unknown;
    normalizeUndefinedToNull?: boolean;
  }): ValidateItemResult {
    // Create validator once - compiles schemas once, validates both fields
    // Even for single item, this is 2x faster than fresh Ajv per field
    const validator = new DatasetSchemaValidator({
      inputSchema: this.inputSchema,
      expectedOutputSchema: this.expectedOutputSchema,
    });

    // Normalize values for validation
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

    // Use the optimized validateItem method
    return validator.validateItem({
      input: inputToValidate,
      expectedOutput: outputToValidate,
    });
  }

  public preparePayload(params: {
    input: string | null | undefined;
    expectedOutput: string | null | undefined;
    metadata: string | null | undefined;
    normalizeUndefinedToNull?: boolean;
  }): PreparePayloadResult {
    // 1. Normalize IO
    const normalizedInput = this.normalize(params.input);
    const normalizedExpectedOutput = this.normalize(params.expectedOutput);
    const normalizedMetadata = this.normalize(params.metadata);

    // 2. Validate IO against schema
    const result = this.validateDatasetItemData({
      input: normalizedInput,
      expectedOutput: normalizedExpectedOutput,
      normalizeUndefinedToNull: params.normalizeUndefinedToNull,
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
      input: normalizedInput,
      expectedOutput: normalizedExpectedOutput,
      metadata: normalizedMetadata,
    };
  }
}
