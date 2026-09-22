import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  activate: vi.fn(),
  complete: vi.fn(),
  conversationFindFirst: vi.fn(),
}));

const queueAdd = vi.fn();

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    inAppAgentConversation: {
      findFirst: prismaMocks.conversationFindFirst,
    },
  },
}));

vi.mock("@langfuse/shared/in-app-agent/server/scriptExecution", () => ({
  activateExecutionCredential: prismaMocks.activate,
  completeScriptExecution: prismaMocks.complete,
}));

vi.mock("@langfuse/shared/src/server", () => ({
  InAppAgentRunQueue: {
    getInstance: () => ({ add: queueAdd }),
  },
  QueueJobs: { InAppAgentRunJob: "in-app-agent-run-job" },
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  getCurrentSpan: vi.fn(),
  instrumentAsync: vi.fn(
    (_options: unknown, callback: () => Promise<unknown>) => callback(),
  ),
  recordDistribution: vi.fn(),
  recordGauge: vi.fn(),
  recordIncrement: vi.fn(),
  redis: null,
  traceException: vi.fn(),
}));

vi.mock("../../env", () => ({
  env: {
    LANGFUSE_IN_APP_AGENT_SCRIPT_EXECUTION_CONTROLLER_INTERVAL_MS: 2_000,
    LANGFUSE_IN_APP_AGENT_SDK_GATEWAY_PUBLIC_URL: "http://localhost:3000",
    NEXTAUTH_URL: "http://localhost:3000",
    NODE_ENV: "test",
  },
}));

vi.mock("../in-app-agent/runtime/sandbox/config", () => ({
  createInAppAgentSandboxProvider: vi.fn(),
  getDefaultInAppAgentSandboxProviderType: vi.fn(),
}));

import { InAppAgentScriptExecutionState } from "@langfuse/shared/in-app-agent";
import { processScriptExecution } from "./index";
import type { SandboxProvider } from "../in-app-agent/runtime/sandbox/types";

describe("processScriptExecution", () => {
  beforeEach(() => {
    prismaMocks.activate.mockReset();
    prismaMocks.complete.mockReset();
    prismaMocks.conversationFindFirst.mockReset();
    queueAdd.mockReset();
    prismaMocks.complete.mockResolvedValue({ continuationRunId: "arun_next" });
    prismaMocks.activate.mockResolvedValue({
      token: "token",
      credentialId: "cred-1",
    });
    prismaMocks.conversationFindFirst.mockResolvedValue({
      providerSessionId: "session-1",
    });
  });

  const execution = {
    id: "exec-1",
    projectId: "project-1",
    conversationId: "conv-1",
    script: "print(1)",
    scriptDigest: "digest",
    state: InAppAgentScriptExecutionState.PENDING,
    deadlineAt: new Date(Date.now() + 60_000),
    providerSessionId: "session-1",
    continuationRunId: null,
  };

  it("launches a pending execution once and does not complete while it is running", async () => {
    const startExecution = vi.fn().mockResolvedValue({
      id: "exec-1",
      state: "RUNNING",
      output: "",
      exitCode: null,
    });
    const getExecution = vi.fn();

    await processScriptExecution({
      execution,
      provider: { startExecution, getExecution } as unknown as SandboxProvider,
    });

    expect(startExecution).toHaveBeenCalledOnce();
    expect(getExecution).not.toHaveBeenCalled();
    expect(prismaMocks.complete).not.toHaveBeenCalled();
  });

  it("marks a lost start acknowledgement as UNKNOWN without launching again", async () => {
    await processScriptExecution({
      execution: {
        ...execution,
        state: InAppAgentScriptExecutionState.RUNNING,
      },
      provider: {
        getExecution: vi.fn().mockResolvedValue(null),
      } as unknown as SandboxProvider,
    });

    expect(prismaMocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: "exec-1",
        state: InAppAgentScriptExecutionState.UNKNOWN,
      }),
    );
    expect(queueAdd).toHaveBeenCalledOnce();
  });

  it("enqueues one continuation when the sandbox reports success", async () => {
    await processScriptExecution({
      execution: {
        ...execution,
        state: InAppAgentScriptExecutionState.RUNNING,
      },
      provider: {
        getExecution: vi.fn().mockResolvedValue({
          id: "exec-1",
          state: "SUCCEEDED",
          output: "ok",
          exitCode: 0,
        }),
      } as unknown as SandboxProvider,
    });

    expect(prismaMocks.complete).toHaveBeenCalledOnce();
    expect(queueAdd).toHaveBeenCalledOnce();
    expect(queueAdd.mock.calls[0]?.[2]).toEqual({ jobId: "arun_next" });
  });

  it("times out a pending execution that already passed its deadline", async () => {
    await processScriptExecution({
      execution: {
        ...execution,
        deadlineAt: new Date(Date.now() - 1_000),
      },
      provider: {
        startExecution: vi.fn(),
      } as unknown as SandboxProvider,
    });

    expect(prismaMocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        state: InAppAgentScriptExecutionState.TIMED_OUT,
      }),
    );
  });
});
