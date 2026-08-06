// @vitest-environment jsdom

import { filterBySearch } from "@/src/features/traces/components/TraceLogView/fns/filterBySearch";
import { flattenChronological } from "@/src/features/traces/components/TraceLogView/fns/flattenChronological";
import {
  createNode,
  createTraceRoot,
} from "@/src/features/traces/components/TraceLogView/__tests__/treeNode.fixtures";

describe("filterBySearch", () => {
  const createTestItems = (): ReturnType<typeof flattenChronological> => {
    const obs1 = createNode({
      id: "gen-123",
      type: "GENERATION",
      name: "chat-completion",
      depth: 0,
    });
    const obs2 = createNode({
      id: "span-456",
      type: "SPAN",
      name: "process-request",
      depth: 0,
    });
    const obs3 = createNode({
      id: "event-789",
      type: "EVENT",
      name: "user-click",
      depth: 0,
    });
    const root = createTraceRoot([obs1, obs2, obs3]);
    return flattenChronological([root]);
  };

  it("should return all items for empty query", () => {
    const items = createTestItems();
    const result = filterBySearch(items, "");
    expect(result).toHaveLength(3);
  });

  it("should return all items for whitespace query", () => {
    const items = createTestItems();
    const result = filterBySearch(items, "   ");
    expect(result).toHaveLength(3);
  });

  it("should filter by name (case-insensitive)", () => {
    const items = createTestItems();

    const result1 = filterBySearch(items, "chat");
    expect(result1).toHaveLength(1);
    expect(result1[0].node.name).toBe("chat-completion");

    const result2 = filterBySearch(items, "CHAT");
    expect(result2).toHaveLength(1);
    expect(result2[0].node.name).toBe("chat-completion");
  });

  it("should filter by type", () => {
    const items = createTestItems();

    const result = filterBySearch(items, "generation");
    expect(result).toHaveLength(1);
    expect(result[0].node.type).toBe("GENERATION");
  });

  it("should filter by id", () => {
    const items = createTestItems();

    const result = filterBySearch(items, "456");
    expect(result).toHaveLength(1);
    expect(result[0].node.id).toBe("span-456");
  });

  it("should match partial strings", () => {
    const items = createTestItems();

    const result = filterBySearch(items, "request");
    expect(result).toHaveLength(1);
    expect(result[0].node.name).toBe("process-request");
  });

  it("should return empty array when no matches", () => {
    const items = createTestItems();
    const result = filterBySearch(items, "nonexistent");
    expect(result).toHaveLength(0);
  });

  it("should match multiple items", () => {
    const items = createTestItems();

    // Both "span" type and observation names contain hyphen-separated words
    const result = filterBySearch(items, "-");
    expect(result).toHaveLength(3); // all have hyphens in name or id
  });

  it("should handle null name gracefully", () => {
    const obs = createNode({
      id: "obs-1",
      type: "GENERATION",
      name: undefined as unknown as string,
      depth: 0,
    });
    const root = createTraceRoot([obs]);
    const items = flattenChronological([root]);

    // Should not throw
    const result = filterBySearch(items, "GENERATION");
    expect(result).toHaveLength(1);
  });
});
