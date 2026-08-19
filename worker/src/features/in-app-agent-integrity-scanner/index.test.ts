import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordGauge: vi.fn(),
  runFindMany: vi.fn(),
  apiKeyCount: vi.fn(),
  runUpdateMany: vi.fn(),
  runUpdate: vi.fn(),
  runDelete: vi.fn(),
  apiKeyDelete: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  recordGauge: mocks.recordGauge,
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    inAppAgentRun: {
      findMany: mocks.runFindMany,
      updateMany: mocks.runUpdateMany,
      update: mocks.runUpdate,
      delete: mocks.runDelete,
    },
    apiKey: { count: mocks.apiKeyCount, delete: mocks.apiKeyDelete },
  },
}));

vi.mock("../../env", () => ({
  env: { LANGFUSE_IN_APP_AGENT_INTEGRITY_SCANNER_INTERVAL_MS: 60_000 },
}));

import { InAppAgentRunStatus } from "@langfuse/shared/in-app-agent";

import { InAppAgentIntegrityScanner } from "./index";

/** Run the scan without touching Redis; the lease is not what we are testing. */
function scannerWithStubbedLock() {
  const scanner = new InAppAgentIntegrityScanner();
  (scanner as unknown as { lock: unknown }).lock = {
    withLock: async (operation: () => Promise<unknown>) => operation(),
  };
  return scanner;
}

function gaugeCall(metric: string, tag: Record<string, string>) {
  return mocks.recordGauge.mock.calls.find(
    ([name, , tags]) =>
      name === metric &&
      Object.entries(tag).every(([key, value]) => tags?.[key] === value),
  );
}

describe("in-app agent integrity scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts a run past its deadline without mutating anything", async () => {
    const claimedAt = new Date(Date.now() - 20 * 60_000);
    mocks.runFindMany
      // Unsettled runs: one RUNNING run well past the 15 minute ceiling.
      .mockResolvedValueOnce([
        {
          status: InAppAgentRunStatus.RUNNING,
          createdAt: claimedAt,
          claimedAt,
          heartbeatAt: new Date(),
          finishedAt: null,
        },
      ])
      // Terminal runs still holding an MCP key pointer.
      .mockResolvedValueOnce([
        { mcpApiKeyId: "key-1" },
        { mcpApiKeyId: "key-2" },
      ]);
    mocks.apiKeyCount.mockResolvedValue(1);

    await scannerWithStubbedLock().processBatch();

    // A fresh heartbeat must not mask the duration backstop.
    expect(
      gaugeCall("langfuse.in_app_agent.lifecycle_integrity", {
        finding: "run_timeout",
      }),
    ).toEqual([
      "langfuse.in_app_agent.lifecycle_integrity",
      1,
      { finding: "run_timeout" },
    ]);
    // Healthy findings still report zero so the gauges never go absent.
    expect(
      gaugeCall("langfuse.in_app_agent.lifecycle_integrity", {
        finding: "worker_lost",
      })?.[1],
    ).toBe(0);
    expect(
      gaugeCall("langfuse.in_app_agent.active_runs", {
        status: InAppAgentRunStatus.RUNNING,
      })?.[1],
    ).toBe(1);
    // One pointer resolves to a live credential, the other is already deleted.
    expect(
      gaugeCall("langfuse.in_app_agent.orphaned_mcp_api_keys", {
        kind: "live_key",
      })?.[1],
    ).toBe(1);
    expect(
      gaugeCall("langfuse.in_app_agent.orphaned_mcp_api_keys", {
        kind: "stuck_pointer",
      })?.[1],
    ).toBe(1);

    // The invariant that matters: reporting must never repair.
    expect(mocks.runUpdateMany).not.toHaveBeenCalled();
    expect(mocks.runUpdate).not.toHaveBeenCalled();
    expect(mocks.runDelete).not.toHaveBeenCalled();
    expect(mocks.apiKeyDelete).not.toHaveBeenCalled();
  });
});
