import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetInternalTracingHandler, mockProcessTracedEvents } = vi.hoisted(
  () => ({
    mockGetInternalTracingHandler: vi.fn(),
    mockProcessTracedEvents: vi.fn(),
  }),
);

vi.mock("../../server", () => ({
  getInternalTracingHandler: mockGetInternalTracingHandler,
  logger: {
    warn: vi.fn(),
  },
}));

import { createInAppAgentInstrumentation } from "./instrumentation";

describe("in-app agent instrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInternalTracingHandler.mockReturnValue({
      handler: {
        langfuse: {
          trace: vi.fn(() => ({ update: vi.fn() })),
          enqueue: vi.fn(),
        },
      },
      processTracedEvents: mockProcessTracedEvents,
    });
  });

  it("shares one promise when terminal flushes race", async () => {
    let resolveFlush!: () => void;
    mockProcessTracedEvents.mockImplementation(
      () => new Promise<void>((resolve) => (resolveFlush = resolve)),
    );

    const instrumentation = createInAppAgentInstrumentation({
      input: {
        threadId: "thread-1",
        runId: "run-1",
        messages: [],
        tools: [],
        context: [],
      },
      tracing: {
        targetProjectId: "project-1",
        environment: "langfuse-in-app-agent",
        metadata: {},
        runId: "run-1",
        user: {
          id: "user-1",
          isAdmin: false,
        },
      },
    });

    const firstFlush = instrumentation!.flush();
    const secondFlush = instrumentation!.flush();

    expect(firstFlush).toBe(secondFlush);
    expect(mockProcessTracedEvents).toHaveBeenCalledTimes(1);

    resolveFlush();
    await firstFlush;
  });
});
