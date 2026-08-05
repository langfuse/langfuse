/** @vitest-environment node */
import {
  createObservation,
  createObservationsCh,
  getObservationsForTrace,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { describe, expect, it } from "vitest";
import { mapTraceDetailObservations } from "@/src/features/traces/server/mapTraceDetailObservations";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("legacy trace download observation IO", () => {
  it("maps ClickHouse observations with IO for export", async () => {
    const observationId = v4();
    const traceId = v4();
    const metadata = { export_marker: "present" };

    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "SPAN",
      metadata,
      provided_usage_details: { input: 10, output: 20, total: 30 },
      provided_cost_details: { input: 1, output: 2, total: 3 },
      usage_details: { input: 10, output: 20, total: 30 },
      cost_details: { input: 1, output: 2, total: 3 },
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      start_time: Date.now(),
      event_ts: Date.now(),
      name: "download-io-span",
      level: "DEFAULT",
      status_message: null,
      version: "1.0",
      input: JSON.stringify({ prompt: "hello" }),
      output: JSON.stringify({ completion: "world" }),
      provided_model_name: "sample_model",
      internal_model_id: "sample_internal_model_id",
      model_parameters: "{}",
      total_cost: 3,
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      end_time: Date.now(),
      completion_start_time: null,
    });

    await createObservationsCh([observation]);

    const observations = await getObservationsForTrace({
      traceId,
      projectId,
      includeIO: true,
    });

    const [mappedWithoutIO] = mapTraceDetailObservations(observations, false);
    expect(mappedWithoutIO.input).toBeUndefined();
    expect(mappedWithoutIO.output).toBeUndefined();

    const [mappedWithIO] = mapTraceDetailObservations(observations, true);
    expect(mappedWithIO.input).toBe('{"prompt":"hello"}');
    expect(mappedWithIO.output).toBe('{"completion":"world"}');
    expect(mappedWithIO.metadata).toBe('{"export_marker":"present"}');
  });
});
