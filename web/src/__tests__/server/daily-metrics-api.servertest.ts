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
        name: "observation-name-1",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 1000,
        provided_model_name: "model-1",
      }),
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name-2",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 1000,
        provided_model_name: "model-1",
      }),
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name-3",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 100000,
        provided_model_name: "model-2",
      }),
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name-4",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 100000,
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
    expect(metric.countObservations).toBe(4);
    expect(metric.usage).toHaveLength(2);
    expect(metric.totalCost).toBe(1200);
    for (const usage of metric.usage) {
      expect(usage.model).toMatch(/model-\d/g);
      expect(usage.inputUsage).toBe(1234 * 2);
      expect(usage.outputUsage).toBe(5678 * 2);
      expect(usage.totalUsage).toBe(6912 * 2);
      expect(usage.countObservations).toBe(2);
      expect(usage.countTraces).toBe(1);
      expect(usage.totalCost).toBe(600);
    }
  });

  it("should filter daily metrics by environment", async () => {
    const testEnvironment = randomUUID();
    const traces = [
      createTrace({
        user_id: "user-1",
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
        environment: testEnvironment,
      }),
      createTrace({
        user_id: "user-1",
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
        environment: "default",
      }),
    ];

    const observations = [
      createObservation({
        trace_id: traces[0].id,
        project_id: traces[0].project_id,
        name: "observation-name-1",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 1000,
        provided_model_name: "model-1",
        environment: testEnvironment,
      }),
      createObservation({
        trace_id: traces[0].id,
        project_id: traces[0].project_id,
        name: "observation-name-3",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 100000,
        provided_model_name: "model-2",
        environment: testEnvironment,
      }),
      createObservation({
        trace_id: traces[1].id,
        project_id: traces[1].project_id,
        name: "observation-name-1",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 1000,
        provided_model_name: "model-1",
        environment: "default",
      }),
      createObservation({
        trace_id: traces[1].id,
        project_id: traces[1].project_id,
        name: "observation-name-3",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 100000,
        provided_model_name: "model-2",
        environment: "default",
      }),
    ];

    await createTracesCh(traces);
    await createObservationsCh(observations);

    const metrics = await makeZodVerifiedAPICall(
      GetMetricsDailyV1Response,
      "GET",
      `/api/public/metrics/daily?environment=${testEnvironment}`,
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
