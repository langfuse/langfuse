import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
} from "@langfuse/shared/in-app-agent";
import { IN_APP_AGENT_HEARTBEAT_STALE_MS } from "@langfuse/shared/in-app-agent/server/tunables";

const mocks = vi.hoisted(() => ({
  recordGauge: vi.fn(),
  runFindMany: vi.fn(),
  runGroupBy: vi.fn(),
  apiKeyCount: vi.fn(),
  reconcileConversationRuns: vi.fn(),
  cleanupTerminalRunMcpApiKeys: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  recordGauge: mocks.recordGauge,
  redis: {},
}));

vi.mock("@langfuse/shared/src/server/auth/apiKeys", () => ({
  deleteInAppAgentMcpApiKeyFromDb: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    inAppAgentRun: {
      findMany: mocks.runFindMany,
      groupBy: mocks.runGroupBy,
    },
    apiKey: { count: mocks.apiKeyCount },
  },
}));

vi.mock(
  "@langfuse/shared/in-app-agent/server/runLifecycle",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@langfuse/shared/in-app-agent/server/runLifecycle")
    >()),
    reconcileConversationRuns: mocks.reconcileConversationRuns,
    cleanupTerminalRunMcpApiKeys: mocks.cleanupTerminalRunMcpApiKeys,
  }),
);

vi.mock("../../env", () => ({
  env: { LANGFUSE_IN_APP_AGENT_INTEGRITY_RUNNER_INTERVAL_MS: 60_000 },
}));

import { InAppAgentIntegrityRunner } from "./index";

function runnerWithStubbedLock() {
  const runner = new InAppAgentIntegrityRunner();
  const extend = vi.fn().mockResolvedValue(true);
  (runner as unknown as { lock: unknown }).lock = {
    withLock: async (operation: () => Promise<unknown>) => operation(),
    extend,
  };
  return { runner, extend };
}

function runningRow(params: {
  id: string;
  heartbeatAt: Date;
  claimedAt?: Date;
}) {
  const claimedAt = params.claimedAt ?? params.heartbeatAt;
  return {
    id: params.id,
    projectId: "project-1",
    conversationId: "conversation-1",
    status: InAppAgentRunStatus.RUNNING,
    createdAt: claimedAt,
    claimedAt,
    heartbeatAt: params.heartbeatAt,
    finishedAt: null,
  };
}

describe("InAppAgentIntegrityRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runGroupBy.mockResolvedValue([]);
    mocks.runFindMany.mockResolvedValue([]);
    mocks.apiKeyCount.mockResolvedValue(0);
    mocks.reconcileConversationRuns.mockResolvedValue([]);
    mocks.cleanupTerminalRunMcpApiKeys.mockResolvedValue(0);
  });

  it("reconciles a stale RUNNING conversation and cleans its MCP keys", async () => {
    const heartbeatAt = new Date(
      Date.now() - IN_APP_AGENT_HEARTBEAT_STALE_MS - 1,
    );
    mocks.runFindMany
      .mockResolvedValueOnce([runningRow({ id: "run-1", heartbeatAt })])
      .mockResolvedValueOnce([]);
    mocks.reconcileConversationRuns.mockResolvedValue([
      { runId: "run-1", errorCode: InAppAgentRunErrorCode.WORKER_LOST },
    ]);

    mocks.runGroupBy.mockResolvedValue([
      { status: InAppAgentRunStatus.RUNNING, _count: { _all: 9 } },
    ]);

    const { runner, extend } = runnerWithStubbedLock();
    await runner.processBatch();

    expect(extend).toHaveBeenCalled();
    expect(mocks.reconcileConversationRuns).toHaveBeenCalledExactlyOnceWith({
      prisma: expect.anything(),
      projectId: "project-1",
      conversationId: "conversation-1",
    });
    expect(mocks.cleanupTerminalRunMcpApiKeys).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        projectId: "project-1",
        conversationId: "conversation-1",
      }),
    );
    expect(mocks.recordGauge).toHaveBeenCalledWith(
      "langfuse.in_app_agent.active_runs",
      9,
      { status: InAppAgentRunStatus.RUNNING },
    );
  });

  it("does not reconcile a healthy RUNNING conversation", async () => {
    mocks.runFindMany
      .mockResolvedValueOnce([
        runningRow({ id: "run-1", heartbeatAt: new Date() }),
      ])
      .mockResolvedValueOnce([]);

    await runnerWithStubbedLock().runner.processBatch();

    expect(mocks.reconcileConversationRuns).not.toHaveBeenCalled();
    expect(mocks.cleanupTerminalRunMcpApiKeys).not.toHaveBeenCalled();
  });
});
