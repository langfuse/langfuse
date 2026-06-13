import { planCommit } from "@/src/features/search-bar/lib/commit";

describe("planCommit", () => {
  it("lowers a valid draft to filters + search + canonical text", () => {
    const r = planCommit("  level:ERROR timeout in:content  ");
    expect(r.status).toBe("committed");
    if (r.status !== "committed") return;
    expect(r.filters).toEqual([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
    ]);
    expect(r.searchQuery).toBe("timeout");
    expect(r.searchType).toEqual(["content"]);
    // Canonical text preserves the parsed (typed) order.
    expect(r.canonical).toBe("level:ERROR timeout in:content");
  });

  it("defaults searchType to id when no in: scope is present", () => {
    const r = planCommit("level:ERROR");
    expect(r.status).toBe("committed");
    if (r.status !== "committed") return;
    expect(r.searchType).toEqual(["id"]);
    expect(r.searchQuery).toBeNull();
  });

  it("treats an empty draft as a committed empty query", () => {
    const r = planCommit("   ");
    expect(r.status).toBe("committed");
    if (r.status !== "committed") return;
    expect(r.filters).toEqual([]);
    expect(r.searchQuery).toBeNull();
    expect(r.canonical).toBe("");
  });

  it("returns invalid with diagnostics for unrepresentable queries", () => {
    const r = planCommit("level:ERROR OR env:dev");
    expect(r.status).toBe("invalid");
    if (r.status !== "invalid") return;
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });
});
