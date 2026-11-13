// @vitest-environment node

/**
 * Tests for searchJson.ts utilities
 *
 * Critical functionality: search matching, highlight positioning, match counting
 */

import {
  searchInTree,
  getMatchCountsPerNode,
  highlightText,
} from "./searchJson";
import { buildTreeFromJSON } from "./treeStructure";
import { highlightTextWithComments } from "./highlightText";

describe("searchJson", () => {
  describe("searchInTree", () => {
    it.each([
      { text: "İstanbul", query: "stanbul", start: 1, end: 8 },
      { text: "İstanbul", query: "s", start: 1, end: 2 },
      { text: "İ", query: "i", start: 0, end: 1 },
      { text: "i\u0307", query: "İ", start: 0, end: 2 },
      { text: "😀İstanbul", query: "stanbul", start: 3, end: 10 },
    ])(
      "keeps original offsets when searching $text for $query",
      ({ text, query, start, end }) => {
        const tree = buildTreeFromJSON(
          { [text]: text },
          { rootKey: "root", initialExpansion: true },
        );

        const matches = searchInTree(tree, query);
        expect(matches).toHaveLength(2);
        expect(matches.map((match) => match.matchType)).toEqual([
          "key",
          "value",
        ]);
        for (const match of matches) {
          expect(match).toMatchObject({
            highlightStart: start,
            highlightEnd: end,
            matchedText: text.slice(start, end),
          });
          expect(
            highlightTextWithComments(
              text,
              match.highlightStart,
              match.highlightEnd,
            ).filter((segment) => segment.type === "search"),
          ).toEqual([{ text: text.slice(start, end), type: "search" }]);
        }
      },
    );

    it("preserves overlapping matches across repeated case expansions", () => {
      const tree = buildTreeFromJSON(
        { city: "İİİ" },
        { rootKey: "root", initialExpansion: true },
      );

      expect(searchInTree(tree, "i\u0307i")).toMatchObject([
        { highlightStart: 0, highlightEnd: 2, matchedText: "İİ" },
        { highlightStart: 1, highlightEnd: 3, matchedText: "İİ" },
      ]);
    });

    it("should find matches case-insensitively by default", () => {
      const tree = buildTreeFromJSON(
        { name: "John", status: "ACTIVE" },
        { rootKey: "root", initialExpansion: true },
      );

      const matches = searchInTree(tree, "john", { caseSensitive: false });
      expect(matches.length).toBe(1);
      expect(matches[0]?.matchType).toBe("value");
      expect(matches[0]?.matchedText).toBe("John");
    });

    it("should respect case-sensitive search", () => {
      const tree = buildTreeFromJSON(
        { name: "John", status: "ACTIVE" },
        { rootKey: "root", initialExpansion: true },
      );

      const matchesInsensitive = searchInTree(tree, "john", {
        caseSensitive: false,
      });
      expect(matchesInsensitive.length).toBe(1);

      const matchesSensitive = searchInTree(tree, "john", {
        caseSensitive: true,
      });
      expect(matchesSensitive.length).toBe(0);
    });

    it("should find matches in keys", () => {
      const tree = buildTreeFromJSON(
        { userName: "Alice", userAge: 25 },
        { rootKey: "root", initialExpansion: true },
      );

      const matches = searchInTree(tree, "user", { caseSensitive: false });
      expect(matches.length).toBe(2);
      expect(matches.every((m) => m.matchType === "key")).toBe(true);
    });

    it("should find matches in values", () => {
      const tree = buildTreeFromJSON(
        { status: "active", role: "admin" },
        { rootKey: "root", initialExpansion: true },
      );

      const matches = searchInTree(tree, "active", { caseSensitive: false });
      expect(matches.length).toBe(1);
      expect(matches[0]?.matchType).toBe("value");
    });

    it("should handle regex patterns", () => {
      const tree = buildTreeFromJSON(
        { email: "user@example.com", name: "user123" },
        { rootKey: "root", initialExpansion: true },
      );

      // Valid regex: match email pattern
      const matches = searchInTree(tree, "user.*com", {
        caseSensitive: false,
        useRegex: true,
      });
      expect(matches.length).toBeGreaterThan(0);
    });

    it("should handle multiple matches in same string", () => {
      const tree = buildTreeFromJSON(
        { text: "hello hello world" },
        { rootKey: "root", initialExpansion: true },
      );

      const matches = searchInTree(tree, "hello", { caseSensitive: false });
      // Each match in the string creates a separate SearchMatch entry
      expect(matches.length).toBe(2); // Two matches (both "hello")
    });

    it("should return empty array for empty query", () => {
      const tree = buildTreeFromJSON(
        { data: "test" },
        { rootKey: "root", initialExpansion: true },
      );

      const matches = searchInTree(tree, "", { caseSensitive: false });
      expect(matches.length).toBe(0);
    });

    it("should handle special characters in search", () => {
      const tree = buildTreeFromJSON(
        { path: "/api/v1/users", symbol: "$price" },
        { rootKey: "root", initialExpansion: true },
      );

      const matches = searchInTree(tree, "/api", { caseSensitive: false });
      expect(matches.length).toBe(1);
      expect(matches[0]?.matchedText).toContain("/api");
    });
  });

  describe("getMatchCountsPerNode", () => {
    it("should count matches in node and descendants", () => {
      const tree = buildTreeFromJSON(
        {
          user: {
            name: "test",
            email: "test@example.com",
            settings: { theme: "test-theme" },
          },
        },
        { rootKey: "root", initialExpansion: true },
      );

      const matches = searchInTree(tree, "test", { caseSensitive: false });
      const counts = getMatchCountsPerNode(tree, matches);

      // Root should have count including all descendants
      const rootCount = counts.get(tree.rootNode.id);
      expect(rootCount).toBeGreaterThan(0);

      // User node should have count from children
      const userNode = tree.rootNode.children[0];
      if (userNode) {
        const userCount = counts.get(userNode.id);
        expect(userCount).toBeGreaterThan(0);
      }
    });

    it("should return all zeros for no matches", () => {
      const tree = buildTreeFromJSON(
        { data: "value" },
        { rootKey: "root", initialExpansion: true },
      );

      const matches = searchInTree(tree, "xyz123notfound", {
        caseSensitive: false,
      });
      const counts = getMatchCountsPerNode(tree, matches);

      expect(matches.length).toBe(0);
      // Map is not empty - it initializes all nodes with 0
      expect(counts.size).toBeGreaterThan(0);
      // But all counts should be 0
      Array.from(counts.values()).forEach((count) => {
        expect(count).toBe(0);
      });
    });
  });

  describe("highlightText", () => {
    it("should split text into segments with highlight", () => {
      const segments = highlightText("hello world", 0, 5);

      expect(segments.length).toBe(2);
      expect(segments[0]).toEqual({
        text: "hello",
        isHighlight: true,
      });
      expect(segments[1]).toEqual({
        text: " world",
        isHighlight: false,
      });
    });

    it("should handle highlight in middle of text", () => {
      const segments = highlightText("hello world", 6, 11);

      expect(segments.length).toBe(2);
      expect(segments[0]).toEqual({
        text: "hello ",
        isHighlight: false,
      });
      expect(segments[1]).toEqual({
        text: "world",
        isHighlight: true,
      });
    });

    it("should return single segment when no highlight", () => {
      const segments = highlightText("hello world");

      expect(segments.length).toBe(1);
      expect(segments[0]).toEqual({
        text: "hello world",
        isHighlight: false,
      });
    });

    it("should handle highlight at start", () => {
      const segments = highlightText("hello", 0, 5);

      expect(segments.length).toBe(1);
      expect(segments[0]).toEqual({
        text: "hello",
        isHighlight: true,
      });
    });

    it("should handle empty text", () => {
      const segments = highlightText("");

      expect(segments.length).toBe(1);
      expect(segments[0]).toEqual({
        text: "",
        isHighlight: false,
      });
    });
  });
});
