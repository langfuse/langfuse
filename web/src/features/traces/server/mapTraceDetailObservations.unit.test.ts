/** @vitest-environment node */
import { ObservationLevel, ObservationType, type Observation } from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import { mapTraceDetailObservations } from "./mapTraceDetailObservations";

const baseObservation = {
  id: "obs-1",
  traceId: "trace-1",
  projectId: "project-1",
  environment: "default",
  type: ObservationType.SPAN,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:01.000Z"),
  name: "test-span",
  level: ObservationLevel.DEFAULT,
  statusMessage: null,
  version: null,
  parentObservationId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  input: { prompt: "hello" },
  output: { completion: "" },
  metadata: { export_marker: "present" },
  model: null,
  internalModelId: null,
  modelParameters: null,
  completionStartTime: null,
  promptId: null,
  promptName: null,
  promptVersion: null,
  latency: null,
  timeToFirstToken: null,
  providedUsageDetails: {},
  usageDetails: {},
  costDetails: {},
  providedCostDetails: {},
  inputCost: null,
  outputCost: null,
  totalCost: null,
  inputUsage: 0,
  outputUsage: 0,
  totalUsage: 0,
  usagePricingTierId: null,
  usagePricingTierName: null,
  toolDefinitions: null,
  toolCalls: null,
  toolCallNames: null,
} satisfies Observation;

describe("mapTraceDetailObservations", () => {
  it("strips observation IO by default for lightweight trace detail loads", () => {
    const [mapped] = mapTraceDetailObservations([baseObservation], false);

    expect(mapped.input).toBeUndefined();
    expect(mapped.output).toBeUndefined();
    expect(mapped.metadata).toBe('{"export_marker":"present"}');
  });

  it("includes observation IO when requested for legacy trace download", () => {
    const [mapped] = mapTraceDetailObservations([baseObservation], true);

    expect(mapped.input).toBe('{"prompt":"hello"}');
    expect(mapped.output).toBe('{"completion":""}');
    expect(mapped.metadata).toBe('{"export_marker":"present"}');
  });
});
