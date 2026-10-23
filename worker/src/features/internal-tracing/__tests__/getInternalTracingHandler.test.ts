import { beforeEach, describe, expect, it, vi } from "vitest";

const { publish, traceException, logError } = vi.hoisted(() => ({
  publish: vi.fn(),
  traceException: vi.fn(),
  logError: vi.fn(),
}));

vi.mock(
  "../../../../../packages/shared/src/server/otel/internalAiFeatureOtelWriter",
  () => ({
    publishAiFeatureTraceViaOtelIngestion: publish,
  }),
);
vi.mock("../../../../../packages/shared/src/server/instrumentation", () => ({
  traceException,
}));
vi.mock("../../../../../packages/shared/src/server/logger", () => ({
  logger: { error: logError },
}));

import { getInternalTracingHandler } from "../../../../../packages/shared/src/server/llm/getInternalTracingHandler";

const params = {
  targetProjectId: "project-123",
  traceId: "trace-123",
  traceName: "agent-turn",
  environment: "production",
  userId: "user-123",
  sessionId: "session-123",
  metadata: { feature: "in-app-agent" },
};
const agent = {
  id: "agent-123",
  traceId: params.traceId,
  name: "agent-turn",
  startTime: new Date("2026-01-31T06:58:02.218Z"),
  endTime: new Date("2026-01-31T06:58:03.707Z"),
  input: { messages: [{ role: "user", content: "Hello" }] },
  tags: ["in-app-agent"],
};

describe("getInternalTracingHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publish.mockResolvedValue(undefined);
  });

  it("publishes one root AGENT with its latest output and child generations", async () => {
    const handler = getInternalTracingHandler(params);
    handler.recordObservation("AGENT", agent);
    handler.recordObservation("GENERATION", {
      ...agent,
      id: "generation-123",
      parentObservationId: agent.id,
      name: "invoke-model",
      model: "gpt-4.1",
      completionStartTime: agent.endTime,
      usageDetails: { input: 10, output: 5, total: 15 },
      promptName: "system-prompt",
      promptVersion: 3,
    });
    handler.recordObservation("AGENT", { ...agent, output: { text: "Hi" } });
    await handler.processTracedEvents();

    expect(publish).toHaveBeenCalledExactlyOnceWith({
      projectId: params.targetProjectId,
      eventInputs: [
        expect.objectContaining({
          spanId: agent.id,
          traceId: params.traceId,
          parentSpanId: undefined,
          type: "AGENT",
          input: JSON.stringify(agent.input),
          output: JSON.stringify({ text: "Hi" }),
          environment: "production",
          userId: params.userId,
          sessionId: params.sessionId,
          metadata: params.metadata,
          tags: ["in-app-agent"],
        }),
        expect.objectContaining({
          spanId: "generation-123",
          parentSpanId: agent.id,
          type: "GENERATION",
          modelName: "gpt-4.1",
          providedUsageDetails: { input: 10, output: 5, total: 15 },
          promptName: "system-prompt",
          promptVersion: "3",
          completionStartTime: agent.endTime.toISOString(),
        }),
      ],
    });
    await handler.processTracedEvents();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it.each(["GENERATION", "TOOL"] as const)(
    "preserves available skills in published %s event inputs",
    async (type) => {
      const handler = getInternalTracingHandler(params);
      const skillsAvailable = [{ name: "trace-analysis", version: 2 }];
      handler.recordObservation(type, { ...agent, skillsAvailable });

      await handler.processTracedEvents();

      expect(publish).toHaveBeenCalledExactlyOnceWith({
        projectId: params.targetProjectId,
        eventInputs: [
          expect.objectContaining({
            spanId: agent.id,
            type,
            skillsAvailable,
          }),
        ],
      });
    },
  );

  it("does not publish an empty batch", async () => {
    await getInternalTracingHandler(params).processTracedEvents();
    expect(publish).not.toHaveBeenCalled();
  });

  it("records errors without failing the agent", async () => {
    const error = new Error("queue unavailable");
    publish.mockRejectedValueOnce(error);
    const handler = getInternalTracingHandler(params);
    handler.recordObservation("AGENT", {
      ...agent,
      level: "ERROR",
      statusMessage: "agent failed",
    });
    await expect(handler.processTracedEvents()).resolves.toBeUndefined();
    expect(traceException).toHaveBeenCalledWith(error);
    expect(logError).toHaveBeenCalledWith(expect.any(String), { error });
  });
});
