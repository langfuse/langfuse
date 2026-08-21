import { describe, expect, it } from "vitest";
import { buildTraceBatchActionQuery } from "./buildTraceBatchActionQuery";

describe("buildTraceBatchActionQuery", () => {
  it("preserves the active full-text search for select-all actions", () => {
    const query = buildTraceBatchActionQuery({
      filter: [],
      orderBy: { column: "timestamp", order: "DESC" },
      searchQuery: "customer-ref",
      searchType: ["id", "content"],
    });

    expect(query).toEqual({
      filter: [],
      orderBy: { column: "timestamp", order: "DESC" },
      searchQuery: "customer-ref",
      searchType: ["id", "content"],
    });
  });

  it("omits an empty search query", () => {
    const query = buildTraceBatchActionQuery({
      filter: [],
      orderBy: null,
      searchQuery: "",
      searchType: ["id"],
    });

    expect(query).toEqual({
      filter: [],
      orderBy: null,
      searchQuery: undefined,
      searchType: ["id"],
    });
  });
});
