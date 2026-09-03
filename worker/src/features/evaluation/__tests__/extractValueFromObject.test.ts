import { describe, it, expect } from "vitest";
import {
  extractValueFromObjectAsString,
  extractValueFromObject,
} from "@langfuse/shared";

describe("extractValueFromObject", () => {
  describe("JSONPath slice expressions returning multiple elements", () => {
    it("should return full slice result for $[1:]", () => {
      const obj = {
        data: JSON.stringify([
          { role: "human" },
          { role: "ai" },
          { role: "human" },
        ]),
      };

      const result = extractValueFromObject(obj, "data", "$[1:]");
      expect(result.value).toEqual([{ role: "ai" }, { role: "human" }]);
      expect(result.error).toBeNull();
    });

    it("should return full result for $[*].role (wildcard multi-match)", () => {
      const obj = {
        data: JSON.stringify([
          { role: "human" },
          { role: "ai" },
          { role: "human" },
        ]),
      };

      const result = extractValueFromObject(obj, "data", "$[*].role");
      expect(result.value).toEqual(["human", "ai", "human"]);
      expect(result.error).toBeNull();
    });

    it("should return full slice for $[0:2]", () => {
      const obj = {
        data: JSON.stringify(["a", "b", "c", "d"]),
      };

      const result = extractValueFromObject(obj, "data", "$[0:2]");
      expect(result.value).toEqual(["a", "b"]);
      expect(result.error).toBeNull();
    });
  });

  describe("JSONPath filter expressions", () => {
    it('should return matching elements for filter expression $[?(@.role=="user")]', () => {
      const obj = {
        data: JSON.stringify([
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
          { role: "user", content: "bye" },
        ]),
      };

      const result = extractValueFromObject(
        obj,
        "data",
        '$[?(@.role=="user")]',
      );
      expect(result.error).toBeNull();
      expect(result.value).toEqual([
        { role: "user", content: "hi" },
        { role: "user", content: "bye" },
      ]);
    });

    it("rejects constructor-based code execution in filter expressions", () => {
      const obj = { data: JSON.stringify([{ role: "user" }]) };

      // Classic jsonpath-plus RCE vector via the constructor chain. The
      // sandboxed "safe" evaluator must reject it rather than execute it, so the
      // expression errors and never resolves to a filtered match.
      const result = extractValueFromObject(
        obj,
        "data",
        '$[?(@.constructor.constructor("return true")())]',
      );

      expect(result.error).not.toBeNull();
      expect(result.value).not.toEqual([{ role: "user" }]);
    });
  });

  describe("JSONPath single element access (backward compat)", () => {
    it("should preserve unsafe integers as strings when applying a selector", () => {
      const obj = {
        data: '{"id":107505301260286111,"safe":42}',
      };

      const unsafeResult = extractValueFromObject(obj, "data", "$.id");
      expect(unsafeResult.value).toBe("107505301260286111");
      expect(unsafeResult.error).toBeNull();

      const safeResult = extractValueFromObject(obj, "data", "$.safe");
      expect(safeResult.value).toBe(42);
      expect(safeResult.error).toBeNull();
    });

    it("should return unwrapped value for $[0]", () => {
      const obj = {
        data: JSON.stringify(["first", "second", "third"]),
      };

      const result = extractValueFromObject(obj, "data", "$[0]");
      expect(result.value).toBe("first");
      expect(result.error).toBeNull();
    });

    it("should return unwrapped value for $.name", () => {
      const obj = {
        data: JSON.stringify({ name: "Alice", age: 30 }),
      };

      const result = extractValueFromObject(obj, "data", "$.name");
      expect(result.value).toBe("Alice");
      expect(result.error).toBeNull();
    });

    it("should return unwrapped nested object for $.nested", () => {
      const obj = {
        data: JSON.stringify({ nested: { key: "value" } }),
      };

      const result = extractValueFromObject(obj, "data", "$.nested");
      expect(result.value).toEqual({ key: "value" });
      expect(result.error).toBeNull();
    });
  });

  describe("empty result handling", () => {
    it("should return undefined for non-matching JSONPath", () => {
      const obj = {
        data: JSON.stringify({ name: "Alice" }),
      };

      const result = extractValueFromObject(obj, "data", "$.nonexistent");
      expect(result.value).toBeUndefined();
      expect(result.error).toBeNull();
    });

    it("should return undefined when column does not exist", () => {
      const obj = { other: "value" };

      const result = extractValueFromObject(obj, "missing");
      expect(result.value).toBeUndefined();
      expect(result.error).toBeNull();
    });
  });

  describe("primitive value with JSON selector", () => {
    it("should return primitive string as-is when selector is applied", () => {
      const obj = {
        data: "plain text, not JSON",
      };

      const result = extractValueFromObject(obj, "data", "$.field");
      expect(result.value).toBe("plain text, not JSON");
      expect(result.error).toBeNull();
    });

    it("should return number as-is when selector is applied", () => {
      const obj = { data: 42 };

      const result = extractValueFromObject(obj, "data", "$.field");
      expect(result.value).toBe(42);
      expect(result.error).toBeNull();
    });
  });

  describe("no JSON selector", () => {
    it("should return object as-is when no selector is provided", () => {
      const obj = {
        data: { key: "value" },
      };

      const result = extractValueFromObject(obj, "data");
      expect(result.value).toEqual({ key: "value" });
      expect(result.error).toBeNull();
    });

    it("should return primitive string directly", () => {
      const obj = { data: "simple string" };

      const result = extractValueFromObject(obj, "data");
      expect(result.value).toBe("simple string");
      expect(result.error).toBeNull();
    });

    it("should return number as-is", () => {
      const obj = { data: 42 };

      const result = extractValueFromObject(obj, "data");
      expect(result.value).toBe(42);
      expect(result.error).toBeNull();
    });
  });

  describe("multi-encoded JSON strings", () => {
    it("should handle double-encoded JSON with selector", () => {
      const inner = { name: "Alice" };
      const obj = {
        data: JSON.stringify(JSON.stringify(inner)),
      };

      const result = extractValueFromObject(obj, "data", "$.name");
      expect(result.value).toBe("Alice");
      expect(result.error).toBeNull();
    });

    it("should preserve unsafe integers in double-encoded JSON with selector", () => {
      const obj = {
        data: JSON.stringify('{"id":107505301260286111}'),
      };

      const result = extractValueFromObject(obj, "data", "$.id");
      expect(result.value).toBe("107505301260286111");
      expect(result.error).toBeNull();
    });
  });

  describe("extractValueFromObjectAsString", () => {
    it("should preserve string extraction behavior for prompt previews", () => {
      const obj = {
        object: { key: "value", count: 42 },
        array: ["a", "b"],
        zero: 0,
        falseValue: false,
        missing: null,
      };

      expect(extractValueFromObjectAsString(obj, "object").value).toBe(
        '{"key":"value","count":42}',
      );
      expect(extractValueFromObjectAsString(obj, "array").value).toBe(
        '["a","b"]',
      );
      expect(extractValueFromObjectAsString(obj, "zero").value).toBe("0");
      expect(extractValueFromObjectAsString(obj, "falseValue").value).toBe(
        "false",
      );
      expect(extractValueFromObjectAsString(obj, "missing").value).toBe("");
    });
  });
});
