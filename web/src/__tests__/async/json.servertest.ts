/** @jest-environment node */

import {
  replaceIdentifierWithContent,
  isNotJson,
} from "@langfuse/shared/src/server";

describe("json utilities", () => {
  describe("isNotJson function", () => {
    describe("boolean values", () => {
      it("should return true for 'true'", () => {
        expect(isNotJson("true")).toBe(true);
      });

      it("should return true for 'false'", () => {
        expect(isNotJson("false")).toBe(true);
      });

      it("should return false for 'True' (case sensitive)", () => {
        expect(isNotJson("True")).toBe(false);
      });

      it("should return false for 'FALSE' (case sensitive)", () => {
        expect(isNotJson("FALSE")).toBe(false);
      });
    });

    describe("null values", () => {
      it("should return true for 'null'", () => {
        expect(isNotJson("null")).toBe(true);
      });

      it("should return false for 'NULL' (case sensitive)", () => {
        expect(isNotJson("NULL")).toBe(false);
      });

      it("should return false for 'Null' (case sensitive)", () => {
        expect(isNotJson("Null")).toBe(false);
      });
    });

    describe("number values", () => {
      it("should return true for positive integers", () => {
        expect(isNotJson("42")).toBe(true);
        expect(isNotJson("0")).toBe(true);
        expect(isNotJson("999")).toBe(true);
      });

      it("should return true for negative integers", () => {
        expect(isNotJson("-42")).toBe(true);
        expect(isNotJson("-0")).toBe(true);
        expect(isNotJson("-999")).toBe(true);
      });

      it("should return true for decimal numbers", () => {
        expect(isNotJson("3.14")).toBe(true);
        expect(isNotJson("0.5")).toBe(true);
        expect(isNotJson("123.456")).toBe(true);
      });

      it("should return true for negative decimal numbers", () => {
        expect(isNotJson("-3.14")).toBe(true);
        expect(isNotJson("-0.5")).toBe(true);
        expect(isNotJson("-123.456")).toBe(true);
      });

      it("should return true for scientific notation", () => {
        expect(isNotJson("1e10")).toBe(true);
        expect(isNotJson("1.23e10")).toBe(true);
        expect(isNotJson("1.23e-10")).toBe(true);
        expect(isNotJson("1.23e+10")).toBe(true);
      });

      it("should return true for scientific notation with uppercase E", () => {
        expect(isNotJson("1E10")).toBe(true);
        expect(isNotJson("1.23E10")).toBe(true);
        expect(isNotJson("1.23E-10")).toBe(true);
        expect(isNotJson("1.23E+10")).toBe(true);
      });

      it("should return true for negative scientific notation", () => {
        expect(isNotJson("-1e10")).toBe(true);
        expect(isNotJson("-1.23e10")).toBe(true);
        expect(isNotJson("-1.23e-10")).toBe(true);
        expect(isNotJson("-1.23e+10")).toBe(true);
      });

      it("should return true for Infinity", () => {
        expect(isNotJson("Infinity")).toBe(true);
        expect(isNotJson("-Infinity")).toBe(true);
      });

      it("should return false for invalid number formats", () => {
        expect(isNotJson("123abc")).toBe(false);
        expect(isNotJson("12.34.56")).toBe(false);
        expect(isNotJson("1.23e")).toBe(false);
        expect(isNotJson("1.23e10abc")).toBe(false);
        expect(isNotJson("e10")).toBe(false);
        expect(isNotJson("infinity")).toBe(false); // lowercase
        expect(isNotJson("INFINITY")).toBe(false); // uppercase
      });
    });

    describe("JSON object values", () => {
      it("should return true for objects", () => {
        expect(isNotJson("{}")).toBe(true);
        expect(isNotJson('{"key": "value"}')).toBe(true);
        expect(isNotJson('{"nested": {"key": "value"}}')).toBe(true);
        expect(isNotJson('{"string": "value", "number": 42}')).toBe(true);
      });

      it("should return false for strings that start with { but don't end with }", () => {
        expect(isNotJson("{incomplete")).toBe(false);
        expect(isNotJson("{key: value")).toBe(false);
        expect(isNotJson("{")).toBe(false);
      });

      it("should return false for strings that end with } but don't start with {", () => {
        expect(isNotJson("incomplete}")).toBe(false);
        expect(isNotJson("key: value}")).toBe(false);
        expect(isNotJson("}")).toBe(false);
      });
    });

    describe("JSON array values", () => {
      it("should return true for arrays", () => {
        expect(isNotJson("[]")).toBe(true);
        expect(isNotJson("[1, 2, 3]")).toBe(true);
        expect(isNotJson('["string", 42, true]')).toBe(true);
        expect(isNotJson("[[1, 2], [3, 4]]")).toBe(true);
      });

      it("should return false for strings that start with [ but don't end with ]", () => {
        expect(isNotJson("[incomplete")).toBe(false);
        expect(isNotJson("[1, 2, 3")).toBe(false);
        expect(isNotJson("[")).toBe(false);
      });

      it("should return false for strings that end with ] but don't start with [", () => {
        expect(isNotJson("incomplete]")).toBe(false);
        expect(isNotJson("1, 2, 3]")).toBe(false);
        expect(isNotJson("]")).toBe(false);
      });
    });

    describe("string values", () => {
      it("should return false for regular strings", () => {
        expect(isNotJson("hello world")).toBe(false);
        expect(isNotJson("")).toBe(false);
        expect(isNotJson("simple text")).toBe(false);
      });

      it("should return false for strings with special characters", () => {
        expect(isNotJson('hello "world"')).toBe(false);
        expect(isNotJson("line1\nline2")).toBe(false);
        expect(isNotJson("special chars: !@#$%^&*()")).toBe(false);
      });

      it("should return false for strings that look like other types but aren't exact", () => {
        expect(isNotJson("True")).toBe(false); // not exactly "true"
        expect(isNotJson("NULL")).toBe(false); // not exactly "null"
        expect(isNotJson("123abc")).toBe(false); // not a pure number
      });
    });

    describe("edge cases", () => {
      it("should handle whitespace correctly", () => {
        expect(isNotJson(" true")).toBe(false);
        expect(isNotJson("true ")).toBe(false);
        expect(isNotJson(" 123 ")).toBe(false);
        expect(isNotJson(" {} ")).toBe(false);
      });

      it("should handle very long strings", () => {
        const longNumber = "1" + "0".repeat(1000);
        expect(isNotJson(longNumber)).toBe(true);

        const longString = "a" + "b".repeat(1000);
        expect(isNotJson(longString)).toBe(false);
      });

      it("should handle empty and whitespace strings", () => {
        expect(isNotJson("")).toBe(false);
        expect(isNotJson(" ")).toBe(false);
        expect(isNotJson("   ")).toBe(false);
        expect(isNotJson("\t")).toBe(false);
        expect(isNotJson("\n")).toBe(false);
      });
    });
  });
});
