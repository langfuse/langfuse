import { describe, expect, it, vi } from "vitest";
import { LlmBatchRequestStatus } from "@prisma/client";
import { LLMAdapter, type LlmBatchProvider } from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { isLlmBatchDeferredError } from "./errors";
import {
  callLLMViaBatch,
  isBatchInferenceEnabled,
  runLlmBatchTick,
  type LlmBatchSettings,
  type RunWithTransport,
} from "./llmBatchService";
import { CLAIM_PREFIX, type LlmBatchRow, type LlmBatchStore } from "./store";

type Row = LlmBatchRow & {
  submittedAt: Date | null;
  completedAt: Date | null;
  resumedAt: Date | null;
  resumeClaimedAt: Date | null;
  updatedAt: Date;
};

/** In-memory store with the same conditional-update semantics as Prisma's. */
function createMemoryStore(clock: () => Date) {
  const rows = new Map<string, Row>();
  let seq = 0;
  const open = (r: Row) =>
    r.status === LlmBatchRequestStatus.PENDING ||
    r.status === LlmBatchRequestStatus.SUBMITTED;
  const touch = (r: Row, patch: Partial<Row>) =>
    Object.assign(r, patch, { updatedAt: clock() });

  const store: LlmBatchStore = {
    find: async (projectId, jobExecutionId) =>
      [...rows.values()].find(
        (r) => r.projectId === projectId && r.jobExecutionId === jobExecutionId,
      ) ?? null,
    createPending: async (p) => {
      const existing = await store.find(p.projectId, p.jobExecutionId);
      if (existing) return existing;
      const row: Row = {
        id: `row${++seq}`,
        ...p,
        status: LlmBatchRequestStatus.PENDING,
        response: null,
        error: null,
        providerJobId: null,
        createdAt: clock(),
        updatedAt: clock(),
        submittedAt: null,
        completedAt: null,
        resumedAt: null,
        resumeClaimedAt: null,
        resumeQueueName: null,
        resumeJobName: null,
        resumeJobData: null,
      };
      rows.set(row.id, row);
      return row;
    },
    setResumeTarget: async ({ id, queueName, jobName, jobData }) => {
      touch(rows.get(id)!, {
        resumeQueueName: queueName,
        resumeJobName: jobName,
        resumeJobData: jobData as Row["resumeJobData"],
      });
    },
    pendingGroups: async () => {
      const groups = new Map<
        string,
        { llmApiKeyId: string; model: string; count: number; oldest: Date }
      >();
      for (const r of rows.values()) {
        if (r.status !== LlmBatchRequestStatus.PENDING) continue;
        const key = `${r.llmApiKeyId}|${r.model}`;
        const g = groups.get(key) ?? {
          llmApiKeyId: r.llmApiKeyId,
          model: r.model,
          count: 0,
          oldest: r.createdAt,
        };
        g.count += 1;
        if (r.createdAt < g.oldest) g.oldest = r.createdAt;
        groups.set(key, g);
      }
      return [...groups.values()];
    },
    claimPending: async ({ llmApiKeyId, model, limit, claimId }) => {
      const claimed = [...rows.values()]
        .filter(
          (r) =>
            r.status === LlmBatchRequestStatus.PENDING &&
            r.llmApiKeyId === llmApiKeyId &&
            r.model === model,
        )
        .slice(0, limit);
      for (const r of claimed) {
        touch(r, {
          status: LlmBatchRequestStatus.SUBMITTED,
          providerJobId: `${CLAIM_PREFIX}${claimId}`,
        });
      }
      return claimed;
    },
    markSubmitted: async (claimId, providerJobId, at) => {
      for (const r of rows.values()) {
        if (r.providerJobId === `${CLAIM_PREFIX}${claimId}`) {
          touch(r, { providerJobId, submittedAt: at });
        }
      }
    },
    releaseClaim: async (claimId) => {
      for (const r of rows.values()) {
        if (r.providerJobId === `${CLAIM_PREFIX}${claimId}`) {
          touch(r, {
            status: LlmBatchRequestStatus.PENDING,
            providerJobId: null,
          });
        }
      }
    },
    staleClaims: async (before) => {
      const claims = new Map<string, string>();
      for (const r of rows.values()) {
        if (
          r.status === LlmBatchRequestStatus.SUBMITTED &&
          r.providerJobId?.startsWith(CLAIM_PREFIX) &&
          r.updatedAt < before
        ) {
          claims.set(r.providerJobId.slice(CLAIM_PREFIX.length), r.llmApiKeyId);
        }
      }
      return [...claims].map(([claimId, llmApiKeyId]) => ({
        claimId,
        llmApiKeyId,
      }));
    },
    openProviderJobs: async () => {
      const jobs = new Map<string, string>();
      for (const r of rows.values()) {
        if (
          r.status === LlmBatchRequestStatus.SUBMITTED &&
          r.submittedAt &&
          r.providerJobId &&
          !r.providerJobId.startsWith(CLAIM_PREFIX)
        ) {
          jobs.set(r.providerJobId, r.llmApiKeyId);
        }
      }
      return [...jobs].map(([providerJobId, llmApiKeyId]) => ({
        providerJobId,
        llmApiKeyId,
      }));
    },
    rowsOfProviderJob: async (providerJobId) =>
      [...rows.values()].filter(
        (r) =>
          r.providerJobId === providerJobId &&
          r.status === LlmBatchRequestStatus.SUBMITTED,
      ),
    complete: async (id, response, at) => {
      const r = rows.get(id)!;
      if (open(r)) {
        touch(r, {
          status: LlmBatchRequestStatus.SUCCEEDED,
          response: response as Row["response"],
          completedAt: at,
        });
      }
    },
    fail: async (ids, error, at) => {
      for (const id of ids) {
        const r = rows.get(id)!;
        if (open(r)) {
          touch(r, {
            status: LlmBatchRequestStatus.FAILED,
            error,
            completedAt: at,
          });
        }
      }
    },
    openRowsCreatedBefore: async (before) =>
      [...rows.values()].filter((r) => open(r) && r.createdAt < before),
    openRowsOfConnection: async (llmApiKeyId) =>
      [...rows.values()].filter(
        (r) => open(r) && r.llmApiKeyId === llmApiKeyId,
      ),
    claimResumable: async ({ limit, at, staleBefore }) => {
      const claimed = [...rows.values()]
        .filter(
          (r) =>
            !open(r) &&
            r.resumedAt === null &&
            r.resumeQueueName !== null &&
            (r.resumeClaimedAt === null || r.resumeClaimedAt < staleBefore),
        )
        .slice(0, limit);
      for (const r of claimed) touch(r, { resumeClaimedAt: at });
      return claimed;
    },
    markResumed: async (id, at) => {
      touch(rows.get(id)!, { resumedAt: at });
    },
    unclaimResume: async (id) => {
      const r = rows.get(id)!;
      if (r.resumedAt === null) touch(r, { resumeClaimedAt: null });
    },
    deleteFinishedBefore: async (before) => {
      let n = 0;
      for (const [id, r] of rows) {
        if (
          !open(r) &&
          r.resumedAt &&
          r.completedAt &&
          r.completedAt < before
        ) {
          rows.delete(id);
          n++;
        }
      }
      return n;
    },
  };
  return { store, rows };
}

const GEMINI_URL =
  "https://aiplatform.googleapis.com/v1beta1/projects/p/locations/global/publishers/google/models/gemini-4-argon:generateContent";

const REQUEST_BODY = {
  contents: [{ role: "user", parts: [{ text: "Judge this" }] }],
  generationConfig: { responseMimeType: "application/json" },
};

/** Stands in for generateLlmEvaluatorOutput: one provider call via transport. */
function createRun(url = GEMINI_URL, body: unknown = REQUEST_BODY) {
  const calls: Parameters<RunWithTransport>[0][] = [];
  const run: RunWithTransport = async (params) => {
    calls.push(params);
    if (!params.transport) return { online: true };
    const res = await params.transport(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { parsed: await res.json() };
  };
  return { run, calls };
}

const settings: LlmBatchSettings = {
  flushAfterSeconds: 120,
  maxRequestsPerJob: 3,
  maxAgeSeconds: 24 * 3600,
  retentionDays: 7,
};

function setup() {
  let now = new Date("2026-11-02T10:00:00Z");
  const clock = () => now;
  const advance = (seconds: number) => {
    now = new Date(now.getTime() + seconds * 1000);
  };
  const { store, rows } = createMemoryStore(clock);
  const provider = {
    submit: vi.fn<LlmBatchProvider["submit"]>(
      async () => "projects/p/locations/global/batchPredictionJobs/1",
    ),
    poll: vi.fn<LlmBatchProvider["poll"]>(async () => ({
      state: "running" as const,
    })),
    findJob: vi.fn<LlmBatchProvider["findJob"]>(async () => null),
  };
  const resume = vi.fn(async (_row: LlmBatchRow) => {});
  const tick = (
    overrides: {
      getProvider?: () => Promise<LlmBatchProvider | null>;
      store?: LlmBatchStore;
    } = {},
  ) =>
    runLlmBatchTick({
      store: overrides.store ?? store,
      getProvider: overrides.getProvider ?? (async () => provider),
      resume,
      settings,
      now: clock,
    });
  const defer = async (jobExecutionId: string) => {
    const { run } = createRun();
    const error = await callLLMViaBatch({
      projectId: "project",
      jobExecutionId,
      llmApiKeyId: "conn",
      model: "gemini-4-argon",
      batchEnabled: true,
      run,
      store,
    }).catch((e) => e);
    expect(isLlmBatchDeferredError(error)).toBe(true);
    await store.setResumeTarget({
      id: error.batchRequestId,
      projectId: "project",
      queueName: "llm-as-a-judge-execution-queue",
      jobName: "llm-as-a-judge-execution-job",
      jobData: { payload: { jobExecutionId } },
    });
    return error.batchRequestId as string;
  };
  return { store, rows, provider, resume, tick, advance, defer, clock };
}

describe("isBatchInferenceEnabled", () => {
  it("is on for Vertex AI Gemini models on a connection with a batch URI", () => {
    expect(
      isBatchInferenceEnabled({
        adapter: LLMAdapter.VertexAI,
        config: { location: "global", batchGcsUri: "gs://bucket/prefix" },
        model: "gemini-4-argon",
      }),
    ).toBe(true);
  });

  it("is off without a batch URI, for other adapters and for Claude", () => {
    expect(
      isBatchInferenceEnabled({
        adapter: LLMAdapter.VertexAI,
        config: { location: "global" },
        model: "gemini-4-argon",
      }),
    ).toBe(false);
    expect(
      isBatchInferenceEnabled({
        adapter: LLMAdapter.GoogleAIStudio,
        config: { batchGcsUri: "gs://bucket" },
        model: "gemini-4-argon",
      }),
    ).toBe(false);
    expect(
      isBatchInferenceEnabled({
        adapter: LLMAdapter.VertexAI,
        config: { batchGcsUri: "gs://bucket" },
        model: "claude-sonnet-5-5",
      }),
    ).toBe(false);
  });
});

describe("callLLMViaBatch", () => {
  it("captures the provider request without tracing it and defers the call", async () => {
    const { store, rows } = setup();
    const { run, calls } = createRun();

    const error = await callLLMViaBatch({
      projectId: "project",
      jobExecutionId: "exec1",
      llmApiKeyId: "conn",
      model: "gemini-4-argon",
      batchEnabled: true,
      run,
      store,
    }).catch((e) => e);

    expect(isLlmBatchDeferredError(error)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].traced).toBe(false);
    const [row] = rows.values();
    expect(row).toMatchObject({
      id: error.batchRequestId,
      status: LlmBatchRequestStatus.PENDING,
      jobExecutionId: "exec1",
      llmApiKeyId: "conn",
      model: "gemini-4-argon",
      request: REQUEST_BODY,
    });
  });

  it("defers again without a model call while the batch is open", async () => {
    const { store, defer } = setup();
    const id = await defer("exec1");
    const { run, calls } = createRun();

    const error = await callLLMViaBatch({
      projectId: "project",
      jobExecutionId: "exec1",
      llmApiKeyId: "conn",
      model: "gemini-4-argon",
      batchEnabled: true,
      run,
      store,
    }).catch((e) => e);

    expect(isLlmBatchDeferredError(error)).toBe(true);
    expect(error.batchRequestId).toBe(id);
    expect(calls).toHaveLength(0);
  });

  it("replays the stored response as a traced call", async () => {
    const { store, defer, clock } = setup();
    const id = await defer("exec1");
    const response = { candidates: [{ content: { parts: [{ text: "{}" }] } }] };
    await store.complete(id, response, clock());
    const { run, calls } = createRun();

    const output = await callLLMViaBatch({
      projectId: "project",
      jobExecutionId: "exec1",
      llmApiKeyId: "conn",
      model: "gemini-4-argon",
      batchEnabled: true,
      run,
      store,
    });

    expect(output).toEqual({ parsed: response });
    // An untraced capture to check the request, then the traced replay.
    expect(calls.map((c) => c.traced)).toEqual([false, true]);
    expect(calls[1].metadata).toEqual({ llm_batch_request_id: id });
  });

  it("matches the stored request regardless of JSON key order", async () => {
    const { store, defer, clock } = setup();
    const id = await defer("exec1");
    await store.complete(id, { candidates: [] }, clock());
    const { run } = createRun(GEMINI_URL, {
      generationConfig: { responseMimeType: "application/json" },
      contents: [{ parts: [{ text: "Judge this" }], role: "user" }],
    });

    await expect(
      callLLMViaBatch({
        projectId: "project",
        jobExecutionId: "exec1",
        llmApiKeyId: "conn",
        model: "gemini-4-argon",
        batchEnabled: true,
        run,
        store,
      }),
    ).resolves.toEqual({ parsed: { candidates: [] } });
  });

  it("does not replay a result for a request that changed while it waited", async () => {
    const { store, defer, clock } = setup();
    const id = await defer("exec1");
    await store.complete(id, { candidates: [] }, clock());
    const { run, calls } = createRun(GEMINI_URL, {
      ...REQUEST_BODY,
      contents: [{ role: "user", parts: [{ text: "Edited prompt" }] }],
    });

    const error = await callLLMViaBatch({
      projectId: "project",
      jobExecutionId: "exec1",
      llmApiKeyId: "conn",
      model: "gemini-4-argon",
      batchEnabled: true,
      run,
      store,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error.message).toMatch(/model request changed/);
    expect(calls.map((c) => c.traced)).toEqual([false]);
  });

  it("runs online when batch is off and the call has no batch row", async () => {
    const { store, rows } = setup();
    const { run, calls } = createRun();

    const output = await callLLMViaBatch({
      projectId: "project",
      jobExecutionId: "exec1",
      llmApiKeyId: "conn",
      model: "gemini-4-argon",
      batchEnabled: false,
      run,
      store,
    });

    expect(output).toEqual({ online: true });
    expect(calls).toEqual([{ transport: undefined, traced: true }]);
    expect(rows.size).toBe(0);
  });

  it("keeps a waiting call on the batch path after batch was turned off", async () => {
    const { store, defer } = setup();
    await defer("exec1");
    const { run, calls } = createRun();

    const error = await callLLMViaBatch({
      projectId: "project",
      jobExecutionId: "exec1",
      llmApiKeyId: "conn",
      model: "gemini-4-argon",
      batchEnabled: false,
      run,
      store,
    }).catch((e) => e);

    expect(isLlmBatchDeferredError(error)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("turns a failed batch row into a terminal evaluation error", async () => {
    const { store, defer, clock } = setup();
    const id = await defer("exec1");
    await store.fail([id], "quota exceeded", clock());
    const { run } = createRun();

    const error = await callLLMViaBatch({
      projectId: "project",
      jobExecutionId: "exec1",
      llmApiKeyId: "conn",
      model: "gemini-4-argon",
      batchEnabled: true,
      run,
      store,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error.message).toBe("Batch inference failed: quota exceeded");
  });

  it("rejects requests that are not Gemini generateContent calls", async () => {
    const { store, rows } = setup();
    const { run } = createRun(
      "https://us-east5-aiplatform.googleapis.com/v1/projects/p/locations/us-east5/publishers/anthropic/models/claude:rawPredict",
    );

    const error = await callLLMViaBatch({
      projectId: "project",
      jobExecutionId: "exec1",
      llmApiKeyId: "conn",
      model: "claude",
      batchEnabled: true,
      run,
      store,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(rows.size).toBe(0);
  });

  it("propagates errors raised before the request was built", async () => {
    const { store, rows } = setup();
    const run: RunWithTransport = async () => {
      throw new Error("media not found");
    };

    await expect(
      callLLMViaBatch({
        projectId: "project",
        jobExecutionId: "exec1",
        llmApiKeyId: "conn",
        model: "gemini-4-argon",
        batchEnabled: true,
        run,
        store,
      }),
    ).rejects.toThrow("media not found");
    expect(rows.size).toBe(0);
  });
});

describe("runLlmBatchTick", () => {
  it("waits for the flush window, then submits one job per connection and model", async () => {
    const { tick, defer, provider, advance, rows } = setup();
    await defer("exec1");
    await defer("exec2");

    await tick();
    expect(provider.submit).not.toHaveBeenCalled();

    advance(settings.flushAfterSeconds);
    const result = await tick();

    expect(result.submittedJobs).toBe(1);
    expect(provider.submit).toHaveBeenCalledTimes(1);
    const [{ model, items, submissionId }] = provider.submit.mock.calls[0];
    expect(model).toBe("gemini-4-argon");
    // Valid as a Vertex AI label value, for findJob.
    expect(submissionId).toMatch(/^[a-z0-9_-]{1,63}$/);
    expect(items.map((i) => i.request)).toEqual([REQUEST_BODY, REQUEST_BODY]);
    for (const row of rows.values()) {
      expect(row.status).toBe(LlmBatchRequestStatus.SUBMITTED);
      expect(row.providerJobId).toBe(
        "projects/p/locations/global/batchPredictionJobs/1",
      );
    }
  });

  it("submits a full group at once and caps the job size", async () => {
    const { tick, defer, provider } = setup();
    for (const id of ["a", "b", "c", "d"]) await defer(id);

    await tick();

    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect(provider.submit.mock.calls[0][0].items).toHaveLength(3);
  });

  it("resubmits after a failed submit once the provider has no job for it", async () => {
    const { tick, defer, provider, advance, rows } = setup();
    await defer("exec1");
    advance(settings.flushAfterSeconds);
    provider.submit.mockRejectedValueOnce(new Error("GCS 403"));

    await tick();
    const [row] = rows.values();
    expect(row.providerJobId).toMatch(new RegExp(`^${CLAIM_PREFIX}`));
    const submissionId = provider.submit.mock.calls[0][0].submissionId;

    // The claim is kept until it is stale, then checked with the provider.
    await tick();
    expect(provider.submit).toHaveBeenCalledTimes(1);

    advance(11 * 60);
    await tick();
    expect(provider.findJob).toHaveBeenCalledWith(submissionId);
    expect(provider.submit).toHaveBeenCalledTimes(2);
    expect(row.status).toBe(LlmBatchRequestStatus.SUBMITTED);
    expect(row.submittedAt).not.toBeNull();
  });

  it("recovers a submitted job whose id was not saved instead of submitting again", async () => {
    const { tick, defer, provider, advance, rows, store } = setup();
    for (const id of ["a", "b", "c"]) await defer(id);
    const jobName = "projects/p/locations/global/batchPredictionJobs/1";
    // The provider accepted the job, then saving its id failed.
    const failingStore: LlmBatchStore = {
      ...store,
      markSubmitted: async () => {
        throw new Error("database unavailable");
      },
    };
    await tick({ store: failingStore });
    expect(provider.submit).toHaveBeenCalledTimes(1);
    for (const row of rows.values()) expect(row.submittedAt).toBeNull();

    provider.findJob.mockResolvedValueOnce(jobName);
    advance(11 * 60);
    await tick();

    expect(provider.submit).toHaveBeenCalledTimes(1);
    for (const row of rows.values()) {
      expect(row).toMatchObject({
        status: LlmBatchRequestStatus.SUBMITTED,
        providerJobId: jobName,
      });
    }
    expect(provider.poll).toHaveBeenCalledWith(jobName);
  });

  it("keeps a stale claim when the provider lookup fails", async () => {
    const { tick, defer, provider, advance, rows } = setup();
    await defer("exec1");
    advance(settings.flushAfterSeconds);
    provider.submit.mockRejectedValueOnce(new Error("timeout"));
    await tick();

    provider.findJob.mockRejectedValueOnce(new Error("503"));
    advance(11 * 60);
    await tick();

    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect([...rows.values()][0].providerJobId).toMatch(
      new RegExp(`^${CLAIM_PREFIX}`),
    );
  });

  it("stores results, fails rows without one and resumes each evaluation once", async () => {
    const { tick, defer, provider, advance, rows, resume } = setup();
    const ok = await defer("ok");
    const bad = await defer("bad");
    const missing = await defer("missing");
    await tick(); // full group: submitted at once

    provider.poll.mockResolvedValueOnce({
      state: "done",
      results: new Map([
        [ok, { ok: true, response: { candidates: [] } }],
        [bad, { ok: false, error: "Vertex AI batch item failed: blocked" }],
      ]),
    });
    advance(60);
    const result = await tick();

    expect(result).toMatchObject({ completed: 1, failed: 2, resumed: 3 });
    expect(rows.get(ok)).toMatchObject({
      status: LlmBatchRequestStatus.SUCCEEDED,
      response: { candidates: [] },
    });
    expect(rows.get(bad)).toMatchObject({
      status: LlmBatchRequestStatus.FAILED,
      error: "Vertex AI batch item failed: blocked",
    });
    expect(rows.get(missing)?.error).toMatch(/returned no result/);
    expect(resume.mock.calls.map(([row]) => row.jobExecutionId).sort()).toEqual(
      ["bad", "missing", "ok"],
    );

    await tick();
    expect(resume).toHaveBeenCalledTimes(3);
  });

  it("uses the job error for rows of a failed job", async () => {
    const { tick, defer, provider, rows } = setup();
    for (const id of ["a", "b", "c"]) await defer(id);
    await tick();
    provider.poll.mockResolvedValueOnce({
      state: "done",
      results: new Map(),
      jobError: "Vertex AI batch job ended in JOB_STATE_FAILED: quota",
    });

    await tick();

    for (const row of rows.values()) {
      expect(row.error).toBe(
        "Vertex AI batch job ended in JOB_STATE_FAILED: quota",
      );
    }
  });

  it("keeps polling running jobs and survives poll errors", async () => {
    const { tick, defer, provider, rows } = setup();
    for (const id of ["a", "b", "c"]) await defer(id);
    await tick();
    provider.poll.mockRejectedValueOnce(new Error("503"));

    await tick();
    await tick();

    expect(provider.poll).toHaveBeenCalledTimes(3);
    for (const row of rows.values()) {
      expect(row.status).toBe(LlmBatchRequestStatus.SUBMITTED);
    }
  });

  it("fails rows that got no result within the max age", async () => {
    const { tick, defer, advance, rows, resume } = setup();
    for (const id of ["a", "b", "c"]) await defer(id);
    await tick();

    advance(settings.maxAgeSeconds + 1);
    await tick();

    for (const row of rows.values()) {
      expect(row.status).toBe(LlmBatchRequestStatus.FAILED);
      expect(row.error).toBe("No batch result after 24 h");
    }
    expect(resume).toHaveBeenCalledTimes(3);
  });

  it("fails open rows when the connection lost its batch config", async () => {
    const { tick, defer, advance, rows } = setup();
    await defer("exec1");
    advance(settings.flushAfterSeconds);

    await tick({ getProvider: async () => null });

    expect([...rows.values()][0]).toMatchObject({
      status: LlmBatchRequestStatus.FAILED,
      error:
        "The LLM connection was deleted or no longer has batch inference enabled",
    });
  });

  it("skips a connection whose provider fails to load, without failing its rows", async () => {
    const { tick, defer, provider, advance, rows } = setup();
    for (const id of ["a", "b", "c"]) await defer(id);
    await tick();
    advance(settings.flushAfterSeconds);
    await defer("d");
    advance(settings.flushAfterSeconds);

    await tick({
      getProvider: async () => {
        throw new Error("database unavailable");
      },
    });

    for (const row of rows.values()) {
      expect(row.status).not.toBe(LlmBatchRequestStatus.FAILED);
    }
    expect(provider.submit).toHaveBeenCalledTimes(1);

    await tick();
    expect(provider.submit).toHaveBeenCalledTimes(2);
  });

  it("resumes again when a worker died between claiming and enqueueing", async () => {
    const { tick, defer, resume, clock, store, advance, rows } = setup();
    const id = await defer("exec1");
    await store.complete(id, { candidates: [] }, clock());
    // A worker claimed the row and died before markResumed.
    await store.claimResumable({
      limit: 10,
      at: clock(),
      staleBefore: clock(),
    });

    await tick();
    expect(resume).not.toHaveBeenCalled();

    advance(11 * 60);
    await tick();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(rows.get(id)?.resumedAt).not.toBeNull();

    advance(11 * 60);
    await tick();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("retries a resume that failed on the next tick", async () => {
    const { tick, defer, provider, resume, clock, store } = setup();
    const id = await defer("exec1");
    await store.complete(id, { candidates: [] }, clock());
    resume.mockRejectedValueOnce(new Error("redis down"));

    const first = await tick();
    const second = await tick();

    expect(first.resumed).toBe(0);
    expect(second.resumed).toBe(1);
    expect(resume).toHaveBeenCalledTimes(2);
    expect(provider.submit).not.toHaveBeenCalled();
  });

  it("does not submit rows twice when two ticks overlap", async () => {
    const { tick, defer, provider } = setup();
    for (const id of ["a", "b", "c"]) await defer(id);

    await Promise.all([tick(), tick()]);

    const submitted = provider.submit.mock.calls.flatMap(([p]) =>
      p.items.map((i) => i.id),
    );
    expect(submitted.sort()).toEqual(["row1", "row2", "row3"]);
  });

  it("deletes finished rows after the retention period", async () => {
    const { tick, defer, advance, rows, clock, store } = setup();
    const id = await defer("exec1");
    await store.complete(id, {}, clock());
    await tick(); // resumes

    advance(settings.retentionDays * 24 * 3600 + 1);
    await tick();

    expect(rows.size).toBe(0);
  });
});
