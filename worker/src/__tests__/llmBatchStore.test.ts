import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { LlmBatchRequestStatus } from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  CLAIM_PREFIX,
  createPrismaLlmBatchStore,
} from "../features/llm-batch/store";
import { runLlmBatchTick } from "../features/llm-batch/llmBatchService";

const store = createPrismaLlmBatchStore();

async function createRows(n: number) {
  const { projectId } = await createOrgProjectAndApiKey();
  const llmApiKeyId = randomUUID();
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push(
      await store.createPending({
        projectId,
        jobExecutionId: randomUUID(),
        llmApiKeyId,
        model: "gemini-4-argon",
        request: { contents: [{ parts: [{ text: `item ${i}` }] }] },
      }),
    );
  }
  return { projectId, llmApiKeyId, rows };
}

describe("Prisma LLM batch store", () => {
  it("creates one row per job execution", async () => {
    const { projectId, rows } = await createRows(1);
    const [row] = rows;

    const again = await store.createPending({
      projectId,
      jobExecutionId: row.jobExecutionId,
      llmApiKeyId: row.llmApiKeyId,
      model: row.model,
      request: { other: true },
    });

    expect(again.id).toBe(row.id);
    expect(again.request).toEqual(row.request);
    await expect(store.find(projectId, row.jobExecutionId)).resolves.toEqual(
      expect.objectContaining({
        id: row.id,
        status: LlmBatchRequestStatus.PENDING,
      }),
    );
  });

  it("lets only one of two concurrent claims take a row", async () => {
    const { llmApiKeyId, rows } = await createRows(5);

    const [a, b] = await Promise.all([
      store.claimPending({
        llmApiKeyId,
        model: "gemini-4-argon",
        limit: 10,
        claimId: randomUUID(),
      }),
      store.claimPending({
        llmApiKeyId,
        model: "gemini-4-argon",
        limit: 10,
        claimId: randomUUID(),
      }),
    ]);

    const claimed = [...a, ...b].map((r) => r.id).sort();
    expect(claimed).toEqual(rows.map((r) => r.id).sort());
    for (const row of [...a, ...b]) {
      expect(row.status).toBe(LlmBatchRequestStatus.SUBMITTED);
      expect(row.providerJobId?.startsWith(CLAIM_PREFIX)).toBe(true);
    }
  });

  it("runs the full flow: submit, poll, store results and resume once", async () => {
    const { projectId, llmApiKeyId, rows } = await createRows(2);
    for (const row of rows) {
      await store.setResumeTarget({
        id: row.id,
        projectId,
        queueName: "llm-as-a-judge-execution-queue",
        jobName: "llm-as-a-judge-execution-job",
        jobData: { payload: { projectId, jobExecutionId: row.jobExecutionId } },
      });
    }
    const jobName = `projects/p/locations/global/batchPredictionJobs/${Date.now()}`;
    const resumed: string[] = [];
    let polls = 0;
    const tick = () =>
      runLlmBatchTick({
        store: {
          ...store,
          // Only this test's connection: other tests share the database.
          pendingGroups: async () =>
            (await store.pendingGroups()).filter(
              (g) => g.llmApiKeyId === llmApiKeyId,
            ),
          openProviderJobs: async () =>
            (await store.openProviderJobs()).filter(
              (j) => j.llmApiKeyId === llmApiKeyId,
            ),
          claimResumable: async (params) =>
            (await store.claimResumable(params)).filter(
              (r) => r.llmApiKeyId === llmApiKeyId,
            ),
          openRowsCreatedBefore: async () => [],
          deleteFinishedBefore: async () => 0,
        },
        getProvider: async () => ({
          submit: async ({ items }) => {
            expect(items.map((i) => i.id).sort()).toEqual(
              rows.map((r) => r.id).sort(),
            );
            return jobName;
          },
          findJob: async () => null,
          poll: async () => {
            polls += 1;
            return polls === 1
              ? { state: "running" }
              : {
                  state: "done",
                  results: new Map([
                    [rows[0].id, { ok: true, response: { candidates: [] } }],
                    [rows[1].id, { ok: false, error: "blocked" }],
                  ]),
                };
          },
        }),
        resume: async (row) => {
          resumed.push(row.id);
        },
        settings: {
          flushAfterSeconds: 0,
          maxRequestsPerJob: 100,
          maxAgeSeconds: 3600,
          retentionDays: 7,
        },
      });

    await tick(); // submits, first poll: running
    expect(
      (await store.rowsOfProviderJob(jobName)).map((r) => r.status),
    ).toEqual([
      LlmBatchRequestStatus.SUBMITTED,
      LlmBatchRequestStatus.SUBMITTED,
    ]);

    await tick(); // done: results stored and both evaluations resumed
    await tick(); // nothing left to resume

    const after = await prisma.llmBatchRequest.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      orderBy: { createdAt: "asc" },
    });
    expect(after.map((r) => [r.status, r.response, r.error])).toEqual([
      [LlmBatchRequestStatus.SUCCEEDED, { candidates: [] }, null],
      [LlmBatchRequestStatus.FAILED, null, "blocked"],
    ]);
    expect(after.every((r) => r.resumedAt !== null)).toBe(true);
    expect(resumed.sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it("lists stale claims and returns released ones to pending", async () => {
    const { llmApiKeyId, rows } = await createRows(2);
    const claimId = randomUUID();
    await store.claimPending({
      llmApiKeyId,
      model: "gemini-4-argon",
      limit: 10,
      claimId,
    });

    expect(await store.staleClaims(new Date(Date.now() - 60_000))).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ claimId })]),
    );
    const stale = await store.staleClaims(new Date(Date.now() + 1000));
    expect(stale.filter((c) => c.claimId === claimId)).toEqual([
      { claimId, llmApiKeyId },
    ]);

    await store.releaseClaim(claimId);

    const after = await prisma.llmBatchRequest.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    for (const row of after) {
      expect(row.status).toBe(LlmBatchRequestStatus.PENDING);
      expect(row.providerJobId).toBeNull();
    }
  });

  it("claims a finished row for resume once, and again only when the claim is stale", async () => {
    const { projectId, rows } = await createRows(1);
    const [row] = rows;
    await store.setResumeTarget({
      id: row.id,
      projectId,
      queueName: "llm-as-a-judge-execution-queue",
      jobName: "llm-as-a-judge-execution-job",
      jobData: {},
    });
    await store.complete(row.id, { candidates: [] }, new Date());
    const claimFor = async (at: Date, staleBefore: Date) =>
      (await store.claimResumable({ limit: 500, at, staleBefore })).filter(
        (r) => r.id === row.id,
      );

    const t0 = new Date();
    const [first, second] = await Promise.all([
      claimFor(t0, new Date(t0.getTime() - 600_000)),
      claimFor(t0, new Date(t0.getTime() - 600_000)),
    ]);
    expect(first.length + second.length).toBe(1);

    // Fresh claim: not claimed again.
    await expect(
      claimFor(new Date(), new Date(t0.getTime() - 600_000)),
    ).resolves.toHaveLength(0);
    // Stale claim (the worker died): claimed again.
    await expect(
      claimFor(new Date(), new Date(t0.getTime() + 1000)),
    ).resolves.toHaveLength(1);

    await store.markResumed(row.id, new Date());
    await expect(
      claimFor(new Date(), new Date(Date.now() + 1000)),
    ).resolves.toHaveLength(0);
  });

  it("deletes rows with their project", async () => {
    const { projectId, rows } = await createRows(1);

    await prisma.project.delete({ where: { id: projectId } });

    await expect(
      prisma.llmBatchRequest.findUnique({ where: { id: rows[0].id } }),
    ).resolves.toBeNull();
  });
});
