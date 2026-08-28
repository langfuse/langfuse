import {
  createObservation as createObservationObject,
  createTrace,
  createObservationsCh as createObservationsInClickhouse,
  createTracesCh,
  createEvent,
  createEventsCh,
  getUserMetrics,
  getUsersFromEventsTable,
  getUsersCountFromEventsTable,
} from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("getUserMetrics function", () => {
  it("should return correct user metrics for a trace with two observations", async () => {
    const userId = uuidv4();
    const traceId = uuidv4();

    const trace = createTrace({
      id: traceId,
      project_id: projectId,
      user_id: userId,
    });

    await createTracesCh([trace]);

    const observation1 = createObservationObject({
      id: uuidv4(),
      trace_id: traceId,
      project_id: projectId,
      usage_details: {
        input: 100,
        output: 200,
        total: 300,
      },
      total_cost: 50,
      type: "GENERATION",
    });

    const observation2 = createObservationObject({
      id: uuidv4(),
      trace_id: traceId,
      project_id: projectId,
      usage_details: {
        input: 150,
        output: 250,
        total: 400,
      },
      total_cost: 75,
      type: "GENERATION",
    });

    await createObservationsInClickhouse([observation1, observation2]);

    const userMetrics = await getUserMetrics(projectId, [userId], []);

    expect(userMetrics.length).toBe(1);
    expect(userMetrics[0]).toMatchObject({
      userId: userId,
      inputUsage: 250, // 100 + 150
      outputUsage: 450, // 200 + 250
      totalUsage: 700, // 300 + 400
      observationCount: 2,
      traceCount: 1,
      totalCost: 125, // 50 + 75
    });
  });

  it("should return correct user metrics for a trace with two observations and timestamp filter", async () => {
    const userId = uuidv4();
    const traceId = uuidv4();

    const trace = createTrace({
      id: traceId,
      project_id: projectId,
      user_id: userId,
    });

    await createTracesCh([trace]);

    const observation1 = createObservationObject({
      id: uuidv4(),
      trace_id: traceId,
      project_id: projectId,
      usage_details: {
        input: 100,
        output: 200,
        total: 300,
      },
      total_cost: 50,
      type: "GENERATION",
    });

    const observation2 = createObservationObject({
      id: uuidv4(),
      trace_id: traceId,
      project_id: projectId,
      usage_details: {
        input: 150,
        output: 250,
        total: 400,
      },
      total_cost: 75,
      type: "GENERATION",
    });

    await createObservationsInClickhouse([observation1, observation2]);

    const userMetrics = await getUserMetrics(
      projectId,
      [userId],
      [
        {
          column: "timestamp",
          type: "datetime",
          operator: ">=",
          value: new Date(new Date().getTime() - 1000),
        },
      ],
    );

    expect(userMetrics.length).toBe(1);
    expect(userMetrics[0]).toMatchObject({
      userId: userId,
      inputUsage: 250, // 100 + 150
      outputUsage: 450, // 200 + 250
      totalUsage: 700, // 300 + 400
      observationCount: 2,
      traceCount: 1,
      totalCost: 125, // 50 + 75
    });
  });
});

describe("getUsersFromEventsTable", () => {
  it("counts traces per user, not observations, and accepts Users page filters", async () => {
    const projectId = uuidv4();
    const userId = `user-${uuidv4()}`;
    const otherUserId = `user-${uuidv4()}`;
    const traceId = uuidv4();
    const otherTraceId = uuidv4();

    await createEventsCh([
      createEvent({
        project_id: projectId,
        trace_id: traceId,
        user_id: userId,
        environment: "default",
        parent_span_id: "",
      }),
      createEvent({
        project_id: projectId,
        trace_id: traceId,
        user_id: userId,
        environment: "default",
      }),
      createEvent({
        project_id: projectId,
        trace_id: otherTraceId,
        user_id: otherUserId,
        environment: "default",
      }),
    ]);

    const filter = [
      {
        column: "Timestamp",
        type: "datetime" as const,
        operator: ">=" as const,
        value: new Date(Date.now() - 60_000),
      },
      {
        column: "Timestamp",
        type: "datetime" as const,
        operator: "<=" as const,
        value: new Date(Date.now() + 60_000),
      },
      {
        column: "environment",
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["default"],
      },
    ];

    const [users, total] = await Promise.all([
      getUsersFromEventsTable(projectId, filter, undefined, 50, 0),
      getUsersCountFromEventsTable(projectId, filter),
    ]);

    expect(Number(total[0]?.totalCount)).toBe(2);
    expect(users).toHaveLength(2);
    const matched = users.find((row) => row.user === userId);
    expect(matched).toBeDefined();
    expect(Number(matched?.count)).toBe(1);
  });

  it("filters users by search query", async () => {
    const projectId = uuidv4();
    const matchingUserId = `search-hit-${uuidv4()}`;
    const otherUserId = `other-${uuidv4()}`;

    await createEventsCh([
      createEvent({
        project_id: projectId,
        user_id: matchingUserId,
        environment: "default",
        parent_span_id: "",
      }),
      createEvent({
        project_id: projectId,
        user_id: otherUserId,
        environment: "default",
        parent_span_id: "",
      }),
    ]);

    const users = await getUsersFromEventsTable(
      projectId,
      [],
      "search-hit-",
      50,
      0,
    );

    expect(users).toHaveLength(1);
    expect(users[0]?.user).toBe(matchingUserId);
  });
});
