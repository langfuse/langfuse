import { joinSessionCoreAndMetrics } from "@/src/components/table/use-cases/session-row-data";

describe("joinSessionCoreAndMetrics", () => {
  it("keeps filtered core session fields when metrics contain all-time values", () => {
    const filteredCreatedAt = new Date("2026-06-17T08:53:47.000Z");
    const allTimeCreatedAt = new Date("2026-05-21T16:29:48.000Z");

    const result = joinSessionCoreAndMetrics(
      [
        {
          id: "session-1",
          createdAt: filteredCreatedAt,
          bookmarked: false,
          public: false,
          userIds: ["filtered-user"],
          countTraces: 1,
          traceTags: ["filtered-tag"],
          environment: "dev",
        },
      ],
      [
        {
          id: "session-1",
          createdAt: allTimeCreatedAt,
          bookmarked: true,
          public: true,
          userIds: ["all-time-user"],
          countTraces: 5,
          traceTags: ["old-tag"],
          environment: "prod",
          sessionDuration: 42,
          totalTokens: 123,
        },
      ],
    );

    expect(result.status).toBe("success");
    expect(result.rows).toHaveLength(1);
    expect(result.rows?.[0]).toMatchObject({
      id: "session-1",
      bookmarked: false,
      public: false,
      userIds: ["filtered-user"],
      countTraces: 1,
      traceTags: ["filtered-tag"],
      environment: "dev",
      sessionDuration: 42,
      totalTokens: 123,
    });
    expect(result.rows?.[0]?.createdAt).toBe(filteredCreatedAt);
  });

  it("returns core rows while metrics are loading", () => {
    const createdAt = new Date("2026-06-17T08:53:47.000Z");

    const result = joinSessionCoreAndMetrics([
      {
        id: "session-1",
        createdAt,
      },
    ]);

    expect(result.status).toBe("success");
    expect(result.rows).toEqual([
      {
        id: "session-1",
        createdAt,
      },
    ]);
  });
});
