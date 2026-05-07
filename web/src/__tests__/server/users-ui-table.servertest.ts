import {
  createObservation as createObservationObject,
  createTrace,
} from "@langfuse/shared/src/server";
import {
  createObservationsCh as createObservationsInClickhouse,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";
import { getUserMetrics } from "@langfuse/shared/src/server";

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
