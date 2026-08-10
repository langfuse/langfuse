/**
 * Tests for pathUtils.ts utilities
 *
 * Critical functionality: path manipulation for tree navigation
 */

import {
  joinPath,
  splitPath,
  getParentPath,
  isAncestorPath,
  getAncestorPaths,
} from "./pathUtils";

describe("pathUtils", () => {
  describe("joinPath and splitPath", () => {
    it("should round-trip string keys correctly", () => {
      const parts = ["user", "settings", "theme"];
      const path = joinPath(parts);
      const splitBack = splitPath(path);

      expect(splitBack).toEqual(parts);
    });

    it("should round-trip numeric indices correctly", () => {
      const parts = ["items", 0, "name"];
      const path = joinPath(parts);
      const splitBack = splitPath(path);

      expect(splitBack).toEqual(parts);
    });

    it("should handle mixed string and numeric keys", () => {
      const parts = ["users", 5, "addresses", 0, "city"];
      const path = joinPath(parts);
      const splitBack = splitPath(path);

      expect(splitBack).toEqual(parts);
    });

    it("should handle single element paths", () => {
      const parts = ["root"];
      const path = joinPath(parts);
      const splitBack = splitPath(path);

      expect(splitBack).toEqual(parts);
    });

    it("should handle empty path", () => {
      const parts: (string | number)[] = [];
      const path = joinPath(parts);

      // Empty path becomes "" which splits to [0] (Number("") = 0)
      expect(path).toBe("");
    });

    it("should handle keys with dots", () => {
      // Keys with dots are NOT escaped - they become separate path segments
      // This is a limitation of the dot-notation path system
      const parts = ["user.name", "value"];
      const path = joinPath(parts);

      // "user.name" becomes "user.name.value" which splits to ["user", "name", "value"]
      expect(path).toBe("user.name.value");
    });
  });

  describe("getParentPath", () => {
    it("should return parent path for nested paths", () => {
      expect(getParentPath("user.settings.theme")).toBe("user.settings");
    });

    it("should return parent for array indices", () => {
      expect(getParentPath("items[0].name")).toBe("items[0]");
    });

    it("should return null for root paths", () => {
      expect(getParentPath("root")).toBeNull();
      expect(getParentPath("")).toBeNull();
    });

    it("should handle deeply nested paths", () => {
      expect(getParentPath("a.b.c.d.e.f")).toBe("a.b.c.d.e");
    });
  });

  describe("isAncestorPath", () => {
    it("should return true for direct ancestors", () => {
      expect(isAncestorPath("user", "user.settings")).toBe(true);
      expect(isAncestorPath("user.settings", "user.settings.theme")).toBe(true);
    });

    it("should return true for indirect ancestors", () => {
      expect(isAncestorPath("user", "user.settings.theme.dark")).toBe(true);
    });

    it("should return false for non-ancestors", () => {
      expect(isAncestorPath("user.settings", "user.profile")).toBe(false);
      expect(isAncestorPath("items", "users")).toBe(false);
    });

    it("should return false for same path", () => {
      expect(isAncestorPath("user.settings", "user.settings")).toBe(false);
    });

    it("should return false for descendants", () => {
      expect(isAncestorPath("user.settings.theme", "user.settings")).toBe(
        false,
      );
    });

    it("should handle array indices", () => {
      // Note: Path system uses dots, not brackets: "items.0" not "items[0]"
      expect(isAncestorPath("items", "items.0")).toBe(true);
      expect(isAncestorPath("items.0", "items.0.name")).toBe(true);
      expect(isAncestorPath("items.0", "items.1")).toBe(false);
    });
  });

  describe("getAncestorPaths", () => {
    it("should return all ancestor paths in order", () => {
      const ancestors = getAncestorPaths("user.settings.theme");

      expect(ancestors).toEqual(["user", "user.settings"]);
    });

    it("should return empty array for root path", () => {
      const ancestors = getAncestorPaths("root");

      expect(ancestors).toEqual([]);
    });

    it("should handle deeply nested paths", () => {
      const ancestors = getAncestorPaths("a.b.c.d.e");

      expect(ancestors).toEqual(["a", "a.b", "a.b.c", "a.b.c.d"]);
    });

    it("should handle array indices", () => {
      const ancestors = getAncestorPaths("items[0].tags[2].value");

      expect(ancestors.length).toBeGreaterThan(0);
      expect(ancestors[0]).toContain("items");
    });

    it("should return ancestors in correct order (root to parent)", () => {
      const ancestors = getAncestorPaths("a.b.c");

      // Should be ordered from root to immediate parent
      expect(ancestors[0]).toBe("a");
      expect(ancestors[1]).toBe("a.b");
    });
  });
});
