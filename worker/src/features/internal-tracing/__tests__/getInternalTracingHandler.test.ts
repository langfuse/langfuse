import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExportLocalEvents,
  mockProcessEventBatch,
  mockWrite,
  mockPublishAiFeatureTrace,
} = vi.hoisted(() => ({
  mockExportLocalEvents: vi.fn(),
  mockProcessEventBatch: vi.fn(),
  mockWrite: vi.fn(),
  mockPublishAiFeatureTrace: vi.fn(),
}));

vi.mock("langfuse", () => {
  return {
    Langfuse: class MockLangfuse {
      public _exportLocalEvents = mockExportLocalEvents;
    },
  };
});

vi.mock(
  "../../../../../packages/shared/src/server/ingestion/processEventBatch",
  () => ({
    processEventBatch: mockProcessEventBatch,
  }),
);

vi.mock(
  "../../../../../packages/shared/src/server/otel/internalAiFeatureOtelWriter",
  () => ({
    publishAiFeatureTraceViaOtelIngestion: mockPublishAiFeatureTrace,
  }),
);

import { getInternalTracingHandler } from "../../../../../packages/shared/src/server/llm/getInternalTracingHandler";
import { LangfuseInternalTraceEnvironment } from "@langfuse/shared";
import { env } from "../../../../../packages/shared/src/env";

const traceId = "trace-123";
const processedEventsFixture = [
  {
    type: "trace-create",
    timestamp: "2026-01-31T06:58:02.221Z",
    body: {
      id: traceId,
      traceId,
      startTime: "2026-01-31T06:58:02.218Z",
      environment: LangfuseInternalTraceEnvironment.PromptExperiments,
      name: "dataset-run-item-008e4",
      input: [{ role: "user", content: "Hello" }],
    },
  },
  {
    type: "generation-create",
    timestamp: "2026-01-31T06:58:02.222Z",
    body: {
      id: "generation-123",
      traceId,
      parentObservationId: traceId,
      startTime: "2026-01-31T06:58:02.220Z",
      environment: LangfuseInternalTraceEnvironment.PromptExperiments,
      name: "ChatOpenAI",
      input: [{ role: "user", content: "Hello" }],
      model: "gpt-4.1",
    },
  },
  {
    type: "generation-update",
    timestamp: "2026-01-31T06:58:03.708Z",
    body: {
      id: "generation-123",
      traceId,
      output: { role: "assistant", content: "Hi" },
      endTime: "2026-01-31T06:58:03.707Z",
      usageDetails: {
        input: 10,
        output: 5,
        total: 15,
      },
    },
  },
];

describe("getInternalTracingHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExportLocalEvents.mockResolvedValue(processedEventsFixture);
    mockProcessEventBatch.mockResolvedValue({
      successes: [],
      errors: [],
    });
    mockWrite.mockResolvedValue(undefined);
    mockPublishAiFeatureTrace.mockResolvedValue(undefined);
  });

  it("disables staging propagation when direct event write is enabled", async () => {
    const { processTracedEvents } = getInternalTracingHandler({
      targetProjectId: "project-123",
      traceId,
      traceName: "internal-trace",
      environment: LangfuseInternalTraceEnvironment.PromptExperiments,
      eventsWriter: {
        experimentContext: {
          id: "run-123",
          name: "Prompt run",
          datasetId: "dataset-123",
          itemId: "item-123",
          itemVersion: "2026-01-31T06:57:38.646Z",
        },
        write: mockWrite,
      },
    });

    await processTracedEvents();

    expect(mockProcessEventBatch).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      expect.objectContaining({
        isLangfuseInternal: true,
        forwardToEventsTable: false,
      }),
    );
  });

  it("keeps legacy forwarding behavior when direct event write is disabled", async () => {
    const { processTracedEvents } = getInternalTracingHandler({
      targetProjectId: "project-123",
      traceId,
      traceName: "internal-trace",
      environment: LangfuseInternalTraceEnvironment.LLMJudge,
    });

    await processTracedEvents();

    expect(mockProcessEventBatch).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      expect.objectContaining({
        isLangfuseInternal: true,
        forwardToEventsTable: undefined,
      }),
    );
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("publishes AI-feature traces via OTel on v4 write modes", async () => {
    const previousWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";

    try {
      const { processTracedEvents } = getInternalTracingHandler({
        targetProjectId: "project-123",
        traceId,
        traceName: "agent-turn",
        environment: "production",
        aiFeatureOtelIngestion: true,
      });

      await processTracedEvents();

      expect(mockProcessEventBatch).not.toHaveBeenCalled();
      expect(mockPublishAiFeatureTrace).toHaveBeenCalledWith({
        projectId: "project-123",
        eventInputs: expect.any(Array),
      });
    } finally {
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE = previousWriteMode;
    }
  });

  it("keeps processEventBatch for AI-feature traces in legacy write mode", async () => {
    const previousWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";

    try {
      const { processTracedEvents } = getInternalTracingHandler({
        targetProjectId: "project-123",
        traceId,
        traceName: "agent-turn",
        environment: "production",
        aiFeatureOtelIngestion: true,
      });

      await processTracedEvents();

      expect(mockProcessEventBatch).toHaveBeenCalled();
      expect(mockPublishAiFeatureTrace).not.toHaveBeenCalled();
    } finally {
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE = previousWriteMode;
    }
  });
});
