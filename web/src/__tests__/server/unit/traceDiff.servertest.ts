import { ObservationSchema, type Observation } from "@langfuse/shared";
import { buildTraceDiff } from "@/src/features/traces/server/traceDiff";

const PROJECT_ID = "project-a";
const START = new Date("2026-01-01T00:00:00.000Z");

function observation(overrides: Partial<Observation>): Observation {
  return ObservationSchema.parse({
    id: "observation-1",
    traceId: "trace-a",
    projectId: PROJECT_ID,
    environment: "test",
    type: "SPAN",
    startTime: START,
    endTime: null,
    name: "root",
    metadata: { source: "test" },
    parentObservationId: null,
    level: "DEFAULT",
    statusMessage: null,
    version: null,
    createdAt: START,
    updatedAt: START,
    model: "model-a",
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
    providedUsageDetails: {},
    usageDetails: { input: 10, output: 5, total: 15 },
    costDetails: { total: 0.01 },
    providedCostDetails: { total: 0.01 },
    inputCost: null,
    outputCost: null,
    totalCost: 0.01,
    inputUsage: 10,
    outputUsage: 5,
    totalUsage: 15,
    usagePricingTierId: null,
    usagePricingTierName: null,
    toolDefinitions: null,
    toolCalls: null,
    toolCallNames: null,
    ...overrides,
  });
}

function toolCallOutput(callId: string, args: string) {
  return {
    tool_calls: [
      {
        id: callId,
        type: "function",
        function: { name: "lookup", arguments: args },
      },
    ],
  };
}

function trace(
  traceId: string,
  args = "pwd",
  type: Observation["type"] = "TOOL",
): Observation[] {
  return [
    observation({
      id: `${traceId}-root`,
      name: "root",
      metadata: { requestId: `${traceId}-request`, customer_id: "cus_1" },
    }),
    observation({
      id: `${traceId}-tool`,
      parentObservationId: `${traceId}-root`,
      type,
      name: "lookup",
      startTime: new Date("2026-01-01T00:00:01.000Z"),
      output: toolCallOutput(`${traceId}-call`, args),
      toolCallNames: ["lookup"],
    }),
  ];
}

describe("buildTraceDiff", () => {
  it("ignores volatile observation, parent, and tool-call identities", () => {
    const report = buildTraceDiff(
      { traceId: "left", observations: trace("left") },
      { traceId: "right", observations: trace("right") },
    );
    expect(report.status).toBe("identical");
    expect(report.firstDivergence).toBeUndefined();
    expect(report.left.inputTokens).toBe(20);
    expect(report.right.outputTokens).toBe(10);
    expect(report.left.toolCallCount).toBe(1);
  });

  it("falls back to tool names when tool arrays are empty", () => {
    const observations = trace("left").map((item) =>
      item.type === "TOOL"
        ? {
            ...item,
            output: { tool_calls: [] },
            toolCalls: [],
            toolCallNames: ["lookup"],
          }
        : item,
    );
    const report = buildTraceDiff(
      { traceId: "left", observations },
      { traceId: "right", observations },
    );
    expect(report.left.toolCallCount).toBe(1);
    expect(report.right.toolCallCount).toBe(1);
  });

  it("counts tool calls embedded in JSON string outputs", () => {
    const observations = trace("left").map((item) =>
      item.type === "TOOL"
        ? {
            ...item,
            output: JSON.stringify(toolCallOutput("call-id", "pwd")),
            toolCalls: [],
            toolCallNames: null,
          }
        : item,
    );
    const report = buildTraceDiff(
      { traceId: "left", observations },
      { traceId: "right", observations },
    );
    expect(report.left.toolCallCount).toBe(1);
    expect(report.right.toolCallCount).toBe(1);
  });

  it("preserves business identifiers and timestamps in observation IO", () => {
    const withBusinessIdentity = (traceId: string, businessId: string) =>
      trace(traceId).map((item) =>
        item.type === "TOOL"
          ? {
              ...item,
              input: { id: businessId, timestamp: "2026-01-01T00:00:01Z" },
              output: {
                ...toolCallOutput(`${traceId}-call`, "pwd"),
                result: { id: businessId, timestamp: "2026-01-01T00:00:02Z" },
              },
            }
          : item,
      );
    const report = buildTraceDiff(
      { traceId: "left", observations: withBusinessIdentity("left", "cus_1") },
      {
        traceId: "right",
        observations: withBusinessIdentity("right", "cus_2"),
      },
    );
    expect(report.status).toBe("different");
    expect(report.firstDivergence).toMatchObject({
      index: 1,
      reason: "payload",
    });
    expect(report.firstDivergence?.leftPreview).toContain("cus_1");
    expect(report.firstDivergence?.rightPreview).toContain("cus_2");
  });

  it("keeps distinct unsafe JSON integers exact during canonicalization", () => {
    const withLargeInteger = (traceId: string, businessId: string) =>
      trace(traceId).map((item) =>
        item.type === "TOOL"
          ? {
              ...item,
              input: `{"id":${businessId},"timestamp":"2026-01-01T00:00:01Z"}`,
            }
          : item,
      );
    const report = buildTraceDiff(
      {
        traceId: "left",
        observations: withLargeInteger("left", "9223372036854775806"),
      },
      {
        traceId: "right",
        observations: withLargeInteger("right", "9223372036854775807"),
      },
    );
    expect(report.status).toBe("different");
    expect(report.firstDivergence?.leftPreview).toContain(
      "9223372036854775806",
    );
    expect(report.firstDivergence?.rightPreview).toContain(
      "9223372036854775807",
    );
  });

  it("compares native tool calls while ignoring their provider IDs", () => {
    const withNativeToolCall = (traceId: string, args: string) =>
      trace(traceId).map((item) =>
        item.type === "TOOL"
          ? {
              ...item,
              output: null,
              toolCalls: [
                JSON.stringify({
                  id: `${traceId}-native-call`,
                  type: "function",
                  function: { name: "lookup", arguments: args },
                }),
              ],
            }
          : item,
      );
    const identical = buildTraceDiff(
      { traceId: "left", observations: withNativeToolCall("left", "pwd") },
      { traceId: "right", observations: withNativeToolCall("right", "pwd") },
    );
    expect(identical.status).toBe("identical");
    expect(identical.left.toolCallCount).toBe(1);

    const different = buildTraceDiff(
      { traceId: "left", observations: withNativeToolCall("left", "pwd") },
      { traceId: "right", observations: withNativeToolCall("right", "ls") },
    );
    expect(different.firstDivergence).toMatchObject({
      index: 1,
      reason: "payload",
    });
  });

  it("ignores identity references in recognized tool protocol messages", () => {
    const withToolProtocolIds = (traceId: string) => {
      const callId = `${traceId}-provider-call`;
      return trace(traceId).map((item): Observation =>
        item.type === "TOOL"
          ? {
              ...item,
              output: {
                ...toolCallOutput(callId, "pwd"),
                messages: [
                  {
                    role: "assistant",
                    content: [
                      {
                        type: "tool_use",
                        id: callId,
                        name: "lookup",
                        input: { command: "pwd" },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    tool_call_id: callId,
                    content: { id: "business-id", timestamp: "unchanged" },
                  },
                  { role: "tool", toolCallId: callId, content: "camel" },
                  { role: "tool", tool_use_id: callId, content: "snake" },
                  { type: "tool_result", tool_use_id: callId, content: "ok" },
                  {
                    type: "function_call",
                    id: `${callId}-item`,
                    call_id: callId,
                    name: "lookup",
                    arguments: "pwd",
                  },
                  {
                    type: "function_call_output",
                    id: `${callId}-output`,
                    call_id: callId,
                    output: "ok",
                  },
                ],
              },
            }
          : item,
      );
    };
    const report = buildTraceDiff(
      { traceId: "left", observations: withToolProtocolIds("left") },
      { traceId: "right", observations: withToolProtocolIds("right") },
    );
    expect(report.status).toBe("identical");
  });

  it("orders same-time parallel observations independently of database order", () => {
    const parallelTrace = (traceId: string, reverse = false) => {
      const root = observation({ id: `${traceId}-root`, name: "root" });
      const children = ["alpha", "beta"].map((name) =>
        observation({
          id: `${traceId}-${name}`,
          parentObservationId: `${traceId}-root`,
          type: "TOOL",
          name,
          startTime: new Date("2026-01-01T00:00:01.000Z"),
          output: { result: name },
        }),
      );
      return [root, ...(reverse ? children.reverse() : children)];
    };
    const report = buildTraceDiff(
      { traceId: "left", observations: parallelTrace("left") },
      { traceId: "right", observations: parallelTrace("right", true) },
    );
    expect(report.status).toBe("identical");
  });

  it("uses complete child branches to order identical same-time parents", () => {
    const branch = (traceId: string, branchId: string, childName: string) => {
      const parent = observation({
        id: `${traceId}-${branchId}`,
        parentObservationId: `${traceId}-root`,
        type: "AGENT",
        name: "parallel",
        startTime: new Date("2026-01-01T00:00:01.000Z"),
      });
      const child = observation({
        id: `${traceId}-${branchId}-child`,
        parentObservationId: parent.id,
        type: "TOOL",
        name: childName,
        startTime: new Date("2026-01-01T00:00:02.000Z"),
        output: { result: childName },
      });
      return [parent, child];
    };
    const root = (traceId: string) =>
      observation({ id: `${traceId}-root`, name: "root" });
    const report = buildTraceDiff(
      {
        traceId: "left",
        observations: [
          root("left"),
          ...branch("left", "a", "alpha"),
          ...branch("left", "b", "beta"),
        ],
      },
      {
        traceId: "right",
        observations: [
          root("right"),
          ...branch("right", "b", "beta"),
          ...branch("right", "a", "alpha"),
        ],
      },
    );
    expect(report.status).toBe("identical");
  });

  it("locates the exact observation whose tool arguments changed", () => {
    const report = buildTraceDiff(
      { traceId: "left", observations: trace("left") },
      { traceId: "right", observations: trace("right", "ls") },
    );
    expect(report.status).toBe("different");
    expect(report.firstDivergence).toMatchObject({
      index: 1,
      reason: "payload",
    });
    expect(report.firstDivergence?.location).toContain("TOOL lookup");
    expect(report.firstDivergence?.leftPreview).toContain("pwd");
    expect(report.firstDivergence?.rightPreview).toContain("ls");
    expect(report.firstDivergence?.rightPreview).not.toContain("right-call");
    expect(report.comparedObservations).toBe(1);
  });

  it("reports observation-type changes before comparing payloads", () => {
    const report = buildTraceDiff(
      { traceId: "left", observations: trace("left") },
      { traceId: "right", observations: trace("right", "pwd", "EVENT") },
    );
    expect(report.firstDivergence).toMatchObject({
      index: 1,
      reason: "observation-type",
    });
  });

  it("reports an extra observation as a length divergence", () => {
    const right = trace("right");
    right.push(
      observation({
        id: "extra",
        name: "extra",
        startTime: new Date("2026-01-01T00:00:02.000Z"),
      }),
    );
    const report = buildTraceDiff(
      { traceId: "left", observations: trace("left") },
      { traceId: "right", observations: right },
    );
    expect(report.firstDivergence).toMatchObject({
      index: 2,
      reason: "length",
    });
  });

  it("computes usage and cost deltas", () => {
    const right = trace("right").map((item) =>
      item.type === "TOOL"
        ? { ...item, inputUsage: 15, outputUsage: 7, totalCost: 0.02 }
        : item,
    );
    const report = buildTraceDiff(
      { traceId: "left", observations: trace("left") },
      { traceId: "right", observations: right },
    );
    expect(report.costDelta).toEqual({
      inputTokens: 5,
      outputTokens: 2,
      totalCost: 0.01,
    });
  });

  it("bounds previews without splitting a Unicode surrogate pair", () => {
    const right = trace("right").map((item) =>
      item.type === "TOOL"
        ? { ...item, output: toolCallOutput("other", "🙂".repeat(100)) }
        : item,
    );
    const report = buildTraceDiff(
      { traceId: "left", observations: trace("left") },
      { traceId: "right", observations: right },
      20,
    );
    expect(report.firstDivergence?.rightPreview).not.toContain("�");
    expect(report.firstDivergence?.rightPreview).toContain("…");
  });
});
