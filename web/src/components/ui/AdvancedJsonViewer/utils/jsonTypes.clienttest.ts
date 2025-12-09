/**
 * Tests for jsonTypes.ts utilities
 *
 * Critical functionality: accurate type detection for JSON values
 */

import {
  getJSONType,
  isExpandable,
  getChildren,
  countAllDescendants,
  safeStringify,
} from "./jsonTypes";

describe("jsonTypes", () => {
  describe("getJSONType", () => {
    it("should identify null correctly", () => {
      expect(getJSONType(null)).toBe("null");
    });

    it("should identify undefined correctly", () => {
      expect(getJSONType(undefined)).toBe("undefined");
    });

    it("should identify boolean correctly", () => {
      expect(getJSONType(true)).toBe("boolean");
      expect(getJSONType(false)).toBe("boolean");
    });

    it("should identify number correctly", () => {
      expect(getJSONType(42)).toBe("number");
      expect(getJSONType(3.14)).toBe("number");
      expect(getJSONType(0)).toBe("number");
      expect(getJSONType(-10)).toBe("number");
    });

    it("should identify string correctly", () => {
      expect(getJSONType("hello")).toBe("string");
      expect(getJSONType("")).toBe("string");
    });

    it("should identify array correctly", () => {
      expect(getJSONType([])).toBe("array");
      expect(getJSONType([1, 2, 3])).toBe("array");
      expect(getJSONType(["a", "b"])).toBe("array");
    });

    it("should identify object correctly", () => {
      expect(getJSONType({})).toBe("object");
      expect(getJSONType({ key: "value" })).toBe("object");
      expect(getJSONType({ nested: { data: 123 } })).toBe("object");
    });
  });

  describe("isExpandable", () => {
    it("should return true for arrays", () => {
      expect(isExpandable([])).toBe(true);
      expect(isExpandable([1, 2, 3])).toBe(true);
    });

    it("should return true for objects", () => {
      expect(isExpandable({})).toBe(true);
      expect(isExpandable({ key: "value" })).toBe(true);
    });

    it("should return false for primitives", () => {
      expect(isExpandable(null)).toBe(false);
      expect(isExpandable(undefined)).toBe(false);
      expect(isExpandable(true)).toBe(false);
      expect(isExpandable(42)).toBe(false);
      expect(isExpandable("string")).toBe(false);
    });
  });

  describe("getChildren", () => {
    it("should return key-value pairs for objects", () => {
      const children = getChildren({ name: "Alice", age: 25 });

      expect(children.length).toBe(2);
      expect(children).toContainEqual(["name", "Alice"]);
      expect(children).toContainEqual(["age", 25]);
    });

    it("should return index-value pairs for arrays", () => {
      const children = getChildren(["a", "b", "c"]);

      expect(children.length).toBe(3);
      expect(children).toEqual([
        [0, "a"],
        [1, "b"],
        [2, "c"],
      ]);
    });

    it("should return empty array for primitives", () => {
      expect(getChildren(null)).toEqual([]);
      expect(getChildren(undefined)).toEqual([]);
      expect(getChildren(42)).toEqual([]);
      expect(getChildren("string")).toEqual([]);
      expect(getChildren(true)).toEqual([]);
    });

    it("should preserve object key order", () => {
      const children = getChildren({ z: 1, a: 2, m: 3 });

      expect(children.map((c) => c[0])).toEqual(["z", "a", "m"]);
    });
  });

  describe("countAllDescendants", () => {
    it("should count zero for primitives", () => {
      expect(countAllDescendants(null)).toBe(0);
      expect(countAllDescendants(undefined)).toBe(0);
      expect(countAllDescendants(42)).toBe(0);
      expect(countAllDescendants("string")).toBe(0);
      expect(countAllDescendants(true)).toBe(0);
    });

    it("should count immediate children", () => {
      expect(countAllDescendants([1, 2, 3])).toBe(3);
      expect(countAllDescendants({ a: 1, b: 2 })).toBe(2);
    });

    it("should count nested descendants recursively", () => {
      const data = {
        user: {
          name: "Alice",
          settings: {
            theme: "dark",
            notifications: true,
          },
        },
        config: {
          timeout: 5000,
        },
      };

      const count = countAllDescendants(data);
      // user (1) + name (1) + settings (1) + theme (1) + notifications (1) + config (1) + timeout (1) = 7
      expect(count).toBe(7);
    });

    it("should handle arrays with nested objects", () => {
      const data = [
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
      ];

      const count = countAllDescendants(data);
      // item1 (1) + id (1) + name (1) + item2 (1) + id (1) + name (1) = 6
      expect(count).toBe(6);
    });

    it("should handle deeply nested structures", () => {
      const data = {
        level1: {
          level2: {
            level3: {
              level4: "value",
            },
          },
        },
      };

      const count = countAllDescendants(data);
      // level1 (1) + level2 (1) + level3 (1) + level4 (1) = 4
      expect(count).toBe(4);
    });
  });

  describe("safeStringify", () => {
    it("should stringify simple objects", () => {
      const result = safeStringify({ name: "Alice", age: 25 });
      expect(result).toContain('"name"');
      expect(result).toContain('"Alice"');
      expect(result).toContain('"age"');
      expect(result).toContain("25");
    });

    it("should stringify arrays", () => {
      const result = safeStringify([1, 2, 3]);
      expect(result).toContain("1");
      expect(result).toContain("2");
      expect(result).toContain("3");
    });

    it("should handle primitives", () => {
      expect(safeStringify(null)).toBe("null");
      expect(safeStringify(undefined)).toBeUndefined(); // undefined is not JSON-serializable
      expect(safeStringify(42)).toBe("42");
      expect(safeStringify("hello")).toBe('"hello"');
      expect(safeStringify(true)).toBe("true");
    });

    it("should handle circular references gracefully", () => {
      const circular: Record<string, unknown> = { name: "obj" };
      circular.self = circular;

      const result = safeStringify(circular);
      // Should not throw, should return something (even if it's an error string)
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("should respect indent parameter", () => {
      const result2 = safeStringify({ a: 1 }, 2);
      const result4 = safeStringify({ a: 1 }, 4);

      // More indent = more whitespace
      expect(result4.length).toBeGreaterThan(result2.length);
    });
  });
});
