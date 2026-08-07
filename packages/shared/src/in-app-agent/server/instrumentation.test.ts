import { EventType } from "@ag-ui/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../db";

const tracing = vi.hoisted(() => ({
  handlerCalls: [] as Array<Record<string, unknown>>,
  traceCalls: [] as Array<Record<string, unknown>>,
  generationCalls: [] as Array<Record<string, unknown>>,
  traceUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server")>();
  return {
    ...actual,
    getInternalTracingHandler: (params: Record<string, unknown>) => {
      tracing.handlerCalls.push(params);
      return {
        processTracedEvents: vi.fn().mockResolvedValue(undefined),
        handler: {
          langfuse: {
            trace: (traceParams: Record<string, unknown>) => {
              tracing.traceCalls.push(traceParams);
              return {
                update: (update: Record<string, unknown>) => {
                  tracing.traceUpdates.push(update);
                },
                generation: (generationParams: Record<string, unknown>) => {
                  tracing.generationCalls.push(generationParams);
                  return {
                    traceId: traceParams.id,
                    observationId: generationParams.id,
                    update: vi.fn(),
                    end: vi.fn(),
                  };
                },
              };
            },
          },
        },
      };
    },
  };
});

import { createInAppAgentInstrumentation } from "./instrumentation";
import { resolveInAppAgentLogicalTurnId } from "./runLifecycle";

describe("in-app agent logical-turn tracing", () => {
  beforeEach(() => {
    tracing.handlerCalls.length = 0;
    tracing.traceCalls.length = 0;
    tracing.generationCalls.length = 0;
    tracing.traceUpdates.length = 0;
  });

  it("groups interrupted and continuation runs without replacing root input", async () => {
    const createInstrumentation = (runId: string, turnId: string) =>
      createInAppAgentInstrumentation({
        input: {
          threadId: "conversation-1",
          runId,
          state: null,
          messages: [
            { id: `${runId}-message`, role: "user", content: "Add widgets" },
          ],
          tools: [],
          context: [],
        },
        tracing: {
          environment: "test",
          metadata: {},
          user: { id: "user-1", isAdmin: false },
          runId,
          turnId,
          targetProjectId: "telemetry-project",
        },
      });

    const root = createInstrumentation("run-root", "run-root")!;
    root.recordEvents([
      {
        type: EventType.RUN_FINISHED,
        outcome: {
          type: "interrupt",
          interrupts: [{ id: "interrupt-1", reason: "approval" }],
        },
      },
    ]);
    const continuation = createInstrumentation("run-continuation", "run-root")!;
    continuation.recordEvents([
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: "assistant-1",
        delta: "Done",
      },
      { type: EventType.RUN_FINISHED, outcome: { type: "success" } },
    ]);

    expect(tracing.handlerCalls.map((call) => call.traceId)).toEqual([
      "run-root-trace",
      "run-root-trace",
    ]);
    expect(tracing.traceCalls[0]).toEqual(
      expect.objectContaining({
        id: "run-root-trace",
        sessionId: "conversation-1",
        input: expect.anything(),
      }),
    );
    expect(tracing.traceCalls[1]).not.toHaveProperty("input");
    expect(tracing.generationCalls.map((call) => call.id)).toEqual([
      "run-root",
      "run-continuation",
    ]);
    expect(tracing.traceUpdates).toEqual([
      expect.objectContaining({ output: expect.anything() }),
    ]);

    const prisma = {
      inAppAgentRun: {
        findFirst: vi.fn().mockResolvedValue({
          request: {
            kind: "userMessage",
            turnId: "run-root",
            context: [],
          },
        }),
      },
    } as unknown as PrismaClient;
    await expect(
      resolveInAppAgentLogicalTurnId({
        prisma,
        projectId: "project-1",
        conversationId: "conversation-1",
        runId: "run-continuation",
        request: {
          kind: "approvalDecision",
          parentRunId: "run-root",
          toolCallId: "tool-call-1",
          approved: true,
          context: [],
        },
      }),
    ).resolves.toBe("run-root");
  });
});
