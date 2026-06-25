import { addAttributesToSpan } from "@/src/features/events/server/eventsRouter";

describe("eventsRouter addAttributesToSpan", () => {
  it("handles a nested filter expression input without throwing", () => {
    const setAttribute = vi.fn();
    const span = { setAttribute } as any;

    expect(() =>
      addAttributesToSpan({
        span,
        input: {
          projectId: "input-project-id",
          filter: {
            type: "group",
            operator: "AND",
            conditions: [
              {
                column: "type",
                type: "stringOptions",
                operator: "any of",
                value: ["GENERATION"],
              },
              {
                column: "startTime",
                type: "datetime",
                operator: ">=",
                value: new Date("2026-03-25T22:15:17.734Z"),
              },
              {
                column: "endTime",
                type: "datetime",
                operator: "<=",
                value: new Date("2026-03-26T22:15:17.734Z"),
              },
            ],
          },
          page: 1,
          limit: 1,
          orderBy: null,
          searchQuery: null,
          searchType: [],
        },
        orderBy: undefined,
      }),
    ).not.toThrow();

    // Leaves are flattened from the tree and recorded as span attributes.
    expect(setAttribute).toHaveBeenCalledWith("type", "GENERATION");
    expect(setAttribute).toHaveBeenCalledWith("duration_minutes", 24 * 60);
  });
});
