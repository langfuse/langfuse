import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  getGenerationsForAnalyticsIntegrations,
} from "@langfuse/shared/src/server";

// Regression for the legacy observations-based analytics export: generation
// usage units must be sourced from usage_details (input/output/total), never
// from usage_details['total'] for input or cost_details['total'] for total.
describe("getGenerationsForAnalyticsIntegrations usage units", () => {
  it("maps input/output/total units from usage_details, not cost_details", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();
    const startTime = new Date();

    await createTracesCh([
      createTrace({
        project_id: projectId,
        id: traceId,
        timestamp: startTime.getTime(),
      }),
    ]);

    // Distinct values so a wrong source is unambiguous:
    // usage input/output/total = 11/22/33, cost total = 3.
    const observation = createObservation({
      project_id: projectId,
      trace_id: traceId,
      type: "GENERATION",
      start_time: startTime.getTime(),
      usage_details: { input: 11, output: 22, total: 33 },
      cost_details: { input: 1, output: 2, total: 3 },
      total_cost: 3,
    });
    await createObservationsCh([observation]);

    const records = [];
    for await (const record of getGenerationsForAnalyticsIntegrations(
      projectId,
      "test-project",
      new Date(startTime.getTime() - 60_000),
      new Date(startTime.getTime() + 60_000),
    )) {
      records.push(record);
    }

    const record = records.find((r) => r.langfuse_id === observation.id);
    expect(record).toBeDefined();
    expect(Number(record!.langfuse_input_units)).toBe(11);
    expect(Number(record!.langfuse_output_units)).toBe(22);
    expect(Number(record!.langfuse_total_units)).toBe(33);
    expect(Number(record!.langfuse_cost_usd)).toBe(3);
  });
});
