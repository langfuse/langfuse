import { createObservation, createTrace } from "@langfuse/shared/src/server";
import {
  createObservationsCh,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { randomUUID } from "crypto";
import { GetMetricsDailyV1Response } from "@/src/features/public-api/types/metrics";

describe("/api/public/metrics/daily API Endpoint", () => {
  it("should get correct results from daily metrics", async () => {
    const traceName = randomUUID();
    const createdTrace = createTrace({
      name: traceName,
      user_id: "user-1",
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    const observations = [
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 1000,
        input: "input",
        output: "output",
        provided_model_name: "model-1",
      }),
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name-2",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 100000,
        input: "input-2",
        output: "output-2",
        provided_model_name: "model-2",
      }),
    ];

    await createTracesCh([createdTrace]);
    await createObservationsCh(observations);

    const metrics = await makeZodVerifiedAPICall(
      GetMetricsDailyV1Response,
      "GET",
      `/api/public/metrics/daily?traceName=${traceName}`,
    );

    expect(metrics.body.meta.totalItems).toBe(1);
    expect(metrics.body.meta.totalPages).toBe(1);

    const metric = metrics.body.data[0];
    expect(metric.countTraces).toBe(1);
    expect(metric.countObservations).toBe(2);
    expect(metric.usage).toHaveLength(2);
    expect(metric.totalCost).toBe(600);
    for (const usage of metric.usage) {
      expect(usage.model).toMatch(/model-\d/g);
      expect(usage.inputUsage).toBe(1234);
      expect(usage.outputUsage).toBe(5678);
      expect(usage.totalUsage).toBe(6912);
      expect(usage.countObservations).toBe(1);
      expect(usage.countTraces).toBe(1);
      expect(usage.totalCost).toBe(300);
    }
  });
});
