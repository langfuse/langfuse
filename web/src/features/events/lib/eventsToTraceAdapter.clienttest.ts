import { deepParseJson } from "@langfuse/shared";

import { adaptEventsToTraceFormat } from "./eventsToTraceAdapter";

const baseDate = new Date("2024-01-01T00:00:00.000Z");
type EventInput = Parameters<
  typeof adaptEventsToTraceFormat
>[0]["events"][number];

const createEvent = (overrides: Partial<EventInput> = {}): EventInput => ({
  id: "obs-1",
  traceId: "trace-1",
  projectId: "project-1",
  environment: "default",
  type: "SPAN",
  startTime: baseDate,
  endTime: null,
  name: "Root span",
  metadata: "{}",
  parentObservationId: null,
  level: "DEFAULT",
  statusMessage: null,
  version: null,
  createdAt: baseDate,
  updatedAt: baseDate,
  model: null,
  internalModelId: null,
  modelParameters: null,
  input: null,
  output: null,
  completionStartTime: null,
  promptId: null,
  promptName: null,
  promptVersion: null,
  latency: null,
  timeToFirstToken: null,
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
  userId: null,
  sessionId: null,
  traceName: "Trace name",
  release: null,
  tags: [],
  bookmarked: false,
  public: false,
  traceTags: [],
  traceTimestamp: baseDate,
  toolDefinitionsCount: null,
  toolCallsCount: null,
  inputPrice: null,
  outputPrice: null,
  totalPrice: null,
  ...overrides,
});

describe("adaptEventsToTraceFormat", () => {
  it("does not double-stringify root I/O already stringified for tRPC", () => {
    const input = JSON.stringify({
      prototype: "input",
      safeKey: "input-value",
    });
    const output = JSON.stringify({
      prototype: "output",
      safeKey: "output-value",
    });

    const result = adaptEventsToTraceFormat({
      events: [createEvent()],
      traceId: "trace-1",
      rootIO: {
        input,
        output,
        metadata: JSON.stringify({ prototype: "metadata" }),
      },
    });

    expect(result.trace.input).toBe(input);
    expect(result.trace.output).toBe(output);
    expect(JSON.parse(result.trace.input ?? "{}")).toEqual({
      prototype: "input",
      safeKey: "input-value",
    });
    expect(JSON.parse(result.trace.output ?? "{}")).toEqual({
      prototype: "output",
      safeKey: "output-value",
    });
    expect(deepParseJson(result.trace.input)).toEqual({
      safeKey: "input-value",
    });
    expect(deepParseJson(result.trace.output)).toEqual({
      safeKey: "output-value",
    });
  });
});
