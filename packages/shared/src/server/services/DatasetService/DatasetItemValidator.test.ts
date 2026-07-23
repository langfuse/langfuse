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
});
