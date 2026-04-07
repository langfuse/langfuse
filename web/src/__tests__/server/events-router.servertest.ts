import { addAttributesToSpan } from "@/src/features/events/server/eventsRouter";

describe("eventsRouter addAttributesToSpan", () => {
  it("sets the resolved project id without throwing", () => {
    const setAttribute = jest.fn();
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
                column: "startTime",
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
        resolvedProjectId: "session-project-id",
      }),
    ).not.toThrow();

    expect(setAttribute).toHaveBeenCalledWith(
      "project_id",
      "session-project-id",
    );
  });
});
