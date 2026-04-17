import { describe, it, expect } from "vitest";
import { extractValueFromObject } from "@langfuse/shared";

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
      expect(result.value).toBe(
        JSON.stringify([{ role: "ai" }, { role: "human" }]),
      );
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
      expect(result.value).toBe(JSON.stringify(["human", "ai", "human"]));
      expect(result.error).toBeNull();
    });

    it("should return full slice for $[0:2]", () => {
      const obj = {
        data: JSON.stringify(["a", "b", "c", "d"]),
      };

      const result = extractValueFromObject(obj, "data", "$[0:2]");
      expect(result.value).toBe(JSON.stringify(["a", "b"]));
      expect(result.error).toBeNull();
    });
  });

  describe("JSONPath single element access (backward compat)", () => {
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
      expect(result.value).toBe(JSON.stringify({ key: "value" }));
      expect(result.error).toBeNull();
    });
  });

  describe("empty result handling", () => {
    it("should return empty string for non-matching JSONPath", () => {
      const obj = {
        data: JSON.stringify({ name: "Alice" }),
      };

      const result = extractValueFromObject(obj, "data", "$.nonexistent");
      expect(result.value).toBe("");
      expect(result.error).toBeNull();
    });

    it("should return empty string when column does not exist", () => {
      const obj = { other: "value" };

      const result = extractValueFromObject(obj, "missing");
      expect(result.value).toBe("");
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
      expect(result.value).toBe("42");
      expect(result.error).toBeNull();
    });
  });

  describe("no JSON selector", () => {
    it("should return stringified object when no selector is provided", () => {
      const obj = {
        data: { key: "value" },
      };

      const result = extractValueFromObject(obj, "data");
      expect(result.value).toBe(JSON.stringify({ key: "value" }));
      expect(result.error).toBeNull();
    });

    it("should return primitive string directly", () => {
      const obj = { data: "simple string" };

      const result = extractValueFromObject(obj, "data");
      expect(result.value).toBe("simple string");
      expect(result.error).toBeNull();
    });

    it("should return number as string", () => {
      const obj = { data: 42 };

      const result = extractValueFromObject(obj, "data");
      expect(result.value).toBe("42");
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
  });
});
