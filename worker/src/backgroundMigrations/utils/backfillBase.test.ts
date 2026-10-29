import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commandClickhouse,
  getQueryError,
  logger,
  pollQueryStatus,
  sleep,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  ChunkedClickhouseBackfillMigration,
  type BaseChunkTodo,
  type ChunkedBackfillState,
} from "./backfillBase";

vi.mock("@langfuse/shared/src/server", () => ({
  commandClickhouse: vi.fn(),
  getQueryError: vi.fn(),
  pollQueryStatus: vi.fn(),
  sleep: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { backgroundMigration: { findUnique: vi.fn(), update: vi.fn() } },
}));

class TestBackfill extends ChunkedClickhouseBackfillMigration {
  protected readonly migrationId = "test-backfill";
  protected readonly logPrefix = "[TestBackfill]";
  protected readonly requiredTables = [];
  protected async enumerateChunks() {
    return [{ id: "chunk", partition: "202601", status: "pending" as const }];
  }
  protected buildChunkQuery() {
    return { query: "INSERT INTO test_target SELECT 1", params: {} };
  }
}

describe("chunked backfill query tracking", () => {
  let state: ChunkedBackfillState<BaseChunkTodo>;
  let migration: TestBackfill;

  beforeEach(() => {
    vi.resetAllMocks();
    migration = new TestBackfill();
    state = {
      phase: "backfill",
      chunksLoaded: true,
      todos: [{ id: "chunk", partition: "202601", status: "pending" }],
      activeQueries: [],
      config: {},
    };
    vi.mocked(prisma.backgroundMigration.findUnique).mockImplementation(
      async () => ({ state: structuredClone(state) }) as never,
    );
    vi.mocked(prisma.backgroundMigration.update).mockImplementation(
      async ({ data }) => {
        state = structuredClone(data.state) as unknown as typeof state;
        return {} as never;
      },
    );
    vi.mocked(commandClickhouse).mockImplementation(
      ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    let cycles = 0;
    vi.mocked(sleep).mockImplementation(async (ms) => {
      if (ms === 1 && ++cycles > 10) {
        await migration.abort();
        throw new Error("Scheduler did not converge");
      }
    });
  });

  it("retains a recovered query and its concurrency slot when status lookup fails", async () => {
    const original: BaseChunkTodo = {
      ...state.todos[0],
      status: "in_progress",
      queryId: "original-query",
      startedAt: "2026-01-01T00:01:00.000Z",
    };
    state.todos = [original];
    state.activeQueries = [original.queryId!];
    vi.mocked(pollQueryStatus)
      .mockRejectedValueOnce(new Error("Timeout error"))
      .mockImplementationOnce(async () => {
        await migration.abort();
        return "running";
      });

    await migration.run({ pollIntervalMs: 1 });

    expect(commandClickhouse).not.toHaveBeenCalled();
    expect(state.todos[0]).toEqual(original);
    expect(state.activeQueries).toEqual([original.queryId]);
    expect(pollQueryStatus).toHaveBeenNthCalledWith(
      1,
      original.queryId,
      original.startedAt,
    );
    expect(pollQueryStatus).toHaveBeenNthCalledWith(
      2,
      original.queryId,
      original.startedAt,
    );
  });

  it("does not submit another INSERT or consume retries after startup verification times out", async () => {
    vi.mocked(pollQueryStatus)
      .mockRejectedValueOnce(new Error("Timeout error"))
      .mockRejectedValueOnce(new Error("Timeout error"))
      .mockResolvedValueOnce("running")
      .mockResolvedValue("completed");

    await migration.run({ pollIntervalMs: 1 });

    expect(commandClickhouse).toHaveBeenCalledTimes(1);
    expect(state.todos[0].retryCount ?? 0).toBe(0);
    expect(state.todos[0].status).toBe("completed");
    expect(state.phase).toBe("completed");
    expect(state.activeQueries).toEqual([]);
    const submitted = vi.mocked(commandClickhouse).mock.calls[0][0];
    expect(submitted.abortSignal?.aborted).toBe(true);
    for (const call of vi.mocked(pollQueryStatus).mock.calls) {
      expect(call).toEqual([submitted.queryId, state.todos[0].startedAt]);
    }
  });

  it("records the confirmed query failure even when error details time out", async () => {
    vi.mocked(pollQueryStatus)
      .mockResolvedValueOnce("running")
      .mockResolvedValue("failed");
    vi.mocked(getQueryError).mockRejectedValue(new Error("Timeout error"));

    await expect(
      migration.run({ pollIntervalMs: 1, maxRetries: 1 }),
    ).rejects.toThrow("1 failed chunk(s)");

    expect(state.todos[0].status).toBe("failed");
    expect(state.todos[0].error).toMatch(
      /Query .* failed.*details unavailable/,
    );
    expect(state.todos[0].retryCount).toBe(1);
    expect(state.activeQueries).toEqual([]);
    expect(getQueryError).toHaveBeenCalledWith(
      vi.mocked(commandClickhouse).mock.calls[0][0].queryId,
      state.todos[0].startedAt,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("error-detail lookup failed"),
      expect.objectContaining({ message: "Timeout error" }),
    );
  });

  it("keeps the persisted submission intact when stopped after uncertain startup", async () => {
    vi.mocked(pollQueryStatus).mockImplementationOnce(async () => {
      await migration.abort();
      throw new Error("Timeout error");
    });

    await migration.run({ pollIntervalMs: 1 });

    const submitted = vi.mocked(commandClickhouse).mock.calls[0][0];
    expect(state.todos[0]).toMatchObject({
      status: "in_progress",
      queryId: submitted.queryId,
    });
    expect(state.todos[0].startedAt).toBeDefined();
    expect(state.todos[0].retryCount ?? 0).toBe(0);
    expect(state.activeQueries).toEqual([submitted.queryId]);
    expect(submitted.abortSignal?.aborted).toBe(true);
  });

  it("keeps a legacy query without startedAt and blocks another chunk during a normal polling error", async () => {
    state.todos = [
      { ...state.todos[0], status: "in_progress", queryId: "legacy-query" },
      { id: "next-chunk", partition: "202602", status: "pending" },
    ];
    state.activeQueries = ["legacy-query"];
    vi.mocked(pollQueryStatus)
      .mockResolvedValueOnce("running")
      .mockRejectedValueOnce(new Error("Timeout error"))
      .mockImplementationOnce(async () => {
        await migration.abort();
        return "running";
      });

    await migration.run({ pollIntervalMs: 1, concurrency: 1 });

    expect(commandClickhouse).not.toHaveBeenCalled();
    expect(state.todos[0]).toMatchObject({
      status: "in_progress",
      queryId: "legacy-query",
    });
    expect(state.todos[0].startedAt).toBeUndefined();
    expect(state.todos[0].retryCount).toBeUndefined();
    expect(pollQueryStatus).toHaveBeenLastCalledWith("legacy-query", undefined);
  });

  it("applies the retry limit to a recovered failure even when diagnostics fail", async () => {
    state.todos[0] = {
      ...state.todos[0],
      status: "in_progress",
      queryId: "old-query",
      startedAt: "2026-01-01T00:01:00.000Z",
      retryCount: 1,
    };
    state.activeQueries = ["old-query"];
    vi.mocked(pollQueryStatus).mockResolvedValue("failed");
    vi.mocked(getQueryError).mockRejectedValue(new Error("Timeout error"));

    await expect(
      migration.run({ pollIntervalMs: 1, maxRetries: 2 }),
    ).rejects.toThrow("1 failed chunk(s)");

    expect(commandClickhouse).not.toHaveBeenCalled();
    expect(state.todos[0]).toMatchObject({
      status: "failed",
      retryCount: 2,
      error: "Query old-query failed (error details unavailable)",
    });
    expect(getQueryError).toHaveBeenCalledWith(
      "old-query",
      "2026-01-01T00:01:00.000Z",
    );
    expect(state.activeQueries).toEqual([]);
  });

  it("retries genuine execution failures up to the limit and preserves their error", async () => {
    vi.mocked(pollQueryStatus).mockResolvedValue("failed");
    vi.mocked(getQueryError).mockResolvedValue(
      "Code: 241. Memory limit exceeded",
    );

    await expect(
      migration.run({ pollIntervalMs: 1, maxRetries: 2 }),
    ).rejects.toThrow("1 failed chunk(s)");

    expect(commandClickhouse).toHaveBeenCalledTimes(2);
    expect(state.todos[0]).toMatchObject({
      status: "failed",
      retryCount: 2,
      error: "Code: 241. Memory limit exceeded",
    });
  });

  it("still counts immediate execution rejection against the retry limit", async () => {
    vi.mocked(commandClickhouse).mockRejectedValue(new Error("Syntax error"));

    await expect(
      migration.run({ pollIntervalMs: 1, maxRetries: 2 }),
    ).rejects.toThrow("1 failed chunk(s)");

    expect(commandClickhouse).toHaveBeenCalledTimes(2);
    expect(pollQueryStatus).not.toHaveBeenCalled();
    expect(state.todos[0]).toMatchObject({
      status: "failed",
      retryCount: 2,
      error: "Syntax error",
    });
  });

  it("retains definitive not-found semantics after both startup observations", async () => {
    vi.mocked(pollQueryStatus).mockResolvedValue("not_found");

    await expect(
      migration.run({ pollIntervalMs: 1, maxRetries: 1 }),
    ).rejects.toThrow("1 failed chunk(s)");

    expect(commandClickhouse).toHaveBeenCalledTimes(1);
    expect(pollQueryStatus).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(pollQueryStatus).mock.calls) {
      expect(call).toEqual([
        vi.mocked(commandClickhouse).mock.calls[0][0].queryId,
        state.todos[0].startedAt,
      ]);
    }
    expect(state.todos[0].error).toContain("failed to start on server");
    expect(state.activeQueries).toEqual([]);
  });

  it("completes an old recovered query without resubmitting it", async () => {
    state.todos[0] = {
      ...state.todos[0],
      status: "in_progress",
      queryId: "old-query",
      startedAt: "2026-01-01T00:01:00.000Z",
    };
    state.activeQueries = ["old-query"];
    vi.mocked(pollQueryStatus).mockResolvedValue("completed");

    await migration.run({ pollIntervalMs: 1 });

    expect(commandClickhouse).not.toHaveBeenCalled();
    expect(pollQueryStatus).toHaveBeenCalledWith(
      "old-query",
      "2026-01-01T00:01:00.000Z",
    );
    expect(state.phase).toBe("completed");
    expect(state.todos[0].status).toBe("completed");
    expect(state.activeQueries).toEqual([]);
  });
});
