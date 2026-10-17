import { describe, expect, it } from "vitest";
import { Prisma } from "../../../db";
import { DatasetItemValidator } from "./DatasetItemValidator";

const noSchemas = { inputSchema: null, expectedOutputSchema: null };

const normalizeViaApi = (value: unknown) => {
  const validator = new DatasetItemValidator(noSchemas);
  const result = validator.validateAndNormalize({
    input: value,
    expectedOutput: undefined,
    metadata: undefined,
    normalizeOpts: { sanitizeControlChars: true },
    validateOpts: { normalizeUndefinedToNull: true },
  });
  if (!result.success) throw new Error(result.message);
  return result.input;
};

const normalizeViaTrpc = (value: string) => {
  const validator = new DatasetItemValidator(noSchemas);
  const result = validator.validateAndNormalize({
    input: value,
    expectedOutput: undefined,
    metadata: undefined,
    normalizeOpts: { sanitizeControlChars: true, parseJsonStrings: true },
    validateOpts: { normalizeUndefinedToNull: true },
  });
  if (!result.success) throw new Error(result.message);
  return result.input;
};

describe("DatasetItemValidator", () => {
  // Public API / SDK path: values arrive already parsed by the HTTP body
  // parser, so a string must stay a string (issue #15342).
  describe("already-parsed values (Public API)", () => {
    it("preserves a numeric string instead of coercing it to a number", () => {
      expect(normalizeViaApi("123456")).toBe("123456");
    });

    it.each([
      ["digits", "0042"],
      ["float-like", "1.5"],
      ["negative", "-7"],
      ["boolean-like", "true"],
      ["null-like", "null"],
      ["object-like", '{"key":"value"}'],
      ["array-like", "[1,2,3]"],
      ["scientific notation", "1e5"],
      ["big integer", "12345678901234567890"],
    ])("preserves a %s string verbatim", (_label, value) => {
      expect(normalizeViaApi(value)).toBe(value);
    });

    it("still passes through non-string values untouched", () => {
      expect(normalizeViaApi({ key: "value" })).toEqual({ key: "value" });
      expect(normalizeViaApi([1, 2, 3])).toEqual([1, 2, 3]);
      expect(normalizeViaApi(123456)).toBe(123456);
      expect(normalizeViaApi(true)).toBe(true);
    });

    it("still sanitizes control characters in preserved strings", () => {
      expect(normalizeViaApi("12\u00003456")).toBe("123456");
    });

    it("still treats an empty string as a DB null", () => {
      expect(normalizeViaApi("")).toBe(Prisma.DbNull);
    });
  });

  // Opted-in paths: the tRPC form and the worker batch action both hand over
  // JSON-encoded strings that still need decoding.
  describe("JSON-encoded strings (parseJsonStrings)", () => {
    it("parses an object literal", () => {
      expect(normalizeViaTrpc('{"key":"value"}')).toEqual({ key: "value" });
    });

    it("parses a bare number literal", () => {
      expect(normalizeViaTrpc("123456")).toBe(123456);
    });

    it("parses a quoted string back to a string", () => {
      expect(normalizeViaTrpc('"123456"')).toBe("123456");
    });

    it("leaves unparsable text as a string", () => {
      expect(normalizeViaTrpc("Hello World")).toBe("Hello World");
    });
  });

  // Update merge: fields the caller omits fall back to the existing DB value,
  // which is already decoded and must not be parsed again even when the caller
  // opted into parseJsonStrings (the tRPC updateDatasetItem path — #15342).
  describe("update merge (existingItem)", () => {
    const updateWith = (params: {
      input?: unknown;
      existing: {
        input: unknown;
        expectedOutput: unknown;
        metadata: unknown;
      };
    }) => {
      const validator = new DatasetItemValidator(noSchemas);
      const result = validator.validateAndNormalize({
        input: params.input,
        expectedOutput: undefined,
        metadata: undefined,
        existingItem: params.existing as never,
        normalizeOpts: { parseJsonStrings: true },
        validateOpts: { normalizeUndefinedToNull: false },
      });
      if (!result.success) throw new Error(result.message);
      return result;
    };

    it("carries over a stored numeric string without re-parsing it", () => {
      const result = updateWith({
        input: undefined,
        existing: {
          input: "123456",
          expectedOutput: "true",
          metadata: null,
        },
      });
      expect(result.input).toBe("123456");
      expect(result.expectedOutput).toBe("true");
    });

    it("still parses a freshly supplied JSON string on update", () => {
      const result = updateWith({
        input: '{"key":"value"}',
        existing: { input: "123456", expectedOutput: null, metadata: null },
      });
      expect(result.input).toEqual({ key: "value" });
    });

    it("carries over a stored null as a DB null", () => {
      const result = updateWith({
        input: undefined,
        existing: { input: null, expectedOutput: null, metadata: null },
      });
      expect(result.input).toBe(Prisma.DbNull);
    });
  });
});
