import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createEvent,
  createEventsCh,
  EventsDispatchQueue,
} from "@langfuse/shared/src/server";
import { clickhouseClient } from "@langfuse/shared/src/server/clickhouse";
import { prisma } from "@langfuse/shared/src/db";
import {
  createTopicExecution,
  createTopicFacet,
  enqueueTopicExecution,
  readTopicExecutionSummary,
  readTopicSnapshotSummarizing,
  writeTopicSnapshotSummarizing,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
import { tickTopicSnapshotSetup } from "./snapshotSetup";

// The fit's queue handoff is not under test; dispatch is asserted at the queue boundary.
const counting = vi.hoisted(() => ({ failNext: false }));
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@langfuse/shared/topics/server")>();
  return {
    ...original,
    enqueueTopicExecution: vi.fn(),
    isTopicsProjectEnabled: () => true,
    // Lets a test fail the summary count once, right after seeding.
    countTopicTraceSummaries: async (
      ...args: Parameters<typeof original.countTopicTraceSummaries>
    ) => {
      if (counting.failNext) {
        counting.failNext = false;
        throw new Error("Timeout exceeded");
      }
      return original.countTopicTraceSummaries(...args);
    },
  };
});
const add = vi.fn();
const selection = vi.hoisted(() => ({ failNext: false }));
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...original,
    EventsDispatchQueue: { getInstance: () => ({ add }) },
    // Lets a test fail the first selection once, as a ClickHouse timeout would.
    getTopicSetupTraceIds: async (
      ...args: Parameters<typeof original.getTopicSetupTraceIds>
    ) => {
      if (selection.failNext) {
        selection.failNext = false;
        throw new Error("Timeout exceeded");
      }
      return original.getTopicSetupTraceIds(...args);
    },
  };
});

const DIMENSIONS = 64;

describe("Topics snapshot summarizing", () => {
  const orgId = randomUUID();
  const projectId = randomUUID();

  beforeAll(async () => {
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Topics snapshot test",
        projects: { create: [{ id: projectId, name: "Topics snapshot" }] },
      },
    });
  });

  afterAll(async () => {
    await clickhouseClient().command({
      query: `DELETE FROM topic_facet_summaries WHERE project_id = {projectId:String}`,
      query_params: { projectId },
      clickhouse_settings: { mutations_sync: "1" },
    });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  it("dispatches unsummarized traces with its ID, then enqueues its fit once they settle", async () => {
    // The first selection times out once; the snapshot retries instead of failing.
    selection.failNext = true;
    const facetId = (
      await createTopicFacet({
        projectId,
        name: "Intent",
        description: "",
        prompt: "Describe the request.",
      })
    ).id;
    const start = new Date(Date.now() - 2 * 60 * 60_000);
    const traceIds = ["a", "b", "c"].map((id) => `${projectId}-${id}`);
    await createEventsCh(
      traceIds.map((traceId) =>
        createEvent({
          project_id: projectId,
          trace_id: traceId,
          start_time: start,
          event_ts: start,
        }),
      ),
    );
    const now = new Date();
    const execution = await createTopicExecution(
      {
        operation: "update",
        projectId,
        requestId: randomUUID(),
        facets: [{ facetId, version: 1 }],
        embeddingConfig: {
          embeddingModel: "embed",
          embeddingDimensions: DIMENSIONS,
        },
        timeRange: { from: new Date(now.getTime() - 7 * 86_400_000), to: now },
        exploratory: false,
        analysis: {
          label: "Snapshot",
          filter: [],
          seed: "topics-analysis",
          summarize: { limit: 10, selection: "random" },
        },
      },
      undefined,
      "user",
    );
    expect(execution.phase).toBe("summarizing");

    expect(await tickTopicSnapshotSetup(projectId, execution.id)).toBe(true);
    expect(add).not.toHaveBeenCalled();
    expect(
      await readTopicSnapshotSummarizing(projectId, execution.id),
    ).toMatchObject({ traceIds: null, failedTicks: 1 });

    // Seeding succeeds but its first count fails; the next tick must not seed again.
    counting.failNext = true;
    expect(await tickTopicSnapshotSetup(projectId, execution.id)).toBe(true);
    expect(await tickTopicSnapshotSetup(projectId, execution.id)).toBe(true);
    expect(add.mock.calls.length).toBeGreaterThan(0);
    const dispatchedJobs = add.mock.calls.length;
    expect(await tickTopicSnapshotSetup(projectId, execution.id)).toBe(true);
    expect(add.mock.calls).toHaveLength(dispatchedJobs);

    // A re-seed, as after a lost state write, reuses each trace's revision so the Topics dedup holds.
    const revisions = () =>
      add.mock.calls
        .flatMap(([, job]) =>
          job.payload.traces.map(
            (trace: { traceId: string; revision: string }) =>
              `${trace.traceId}:${trace.revision}`,
          ),
        )
        .sort();
    const first = revisions();
    const seededState = await readTopicSnapshotSummarizing(
      projectId,
      execution.id,
    );
    await writeTopicSnapshotSummarizing(projectId, execution.id, {
      ...seededState!,
      traceIds: null,
    });
    add.mockClear();
    expect(await tickTopicSnapshotSetup(projectId, execution.id)).toBe(true);
    expect(revisions()).toEqual(first);
    const dispatched = add.mock.calls.flatMap(([, job]) => {
      expect(job.payload.batchActionId).toBe(execution.id);
      return job.payload.traces.map(
        (trace: { traceId: string }) => trace.traceId,
      );
    });
    expect(dispatched.sort()).toEqual([...traceIds].sort());
    expect(
      await readTopicExecutionSummary(projectId, execution.id),
    ).toMatchObject({
      phase: "summarizing",
      facets: [{ counts: { requested: 3, complete: 0 } }],
    });

    await writeTopicSummaries(
      traceIds.map((traceId) => ({
        projectId,
        facetId,
        facetVersion: 1,
        traceId,
        sessionId: null,
        triggerType: "automatic" as const,
        environment: "default",
        traceName: "trace",
        unitStartTime: start.toISOString(),
        state: "complete" as const,
        summary: "summary",
        embedding: Array<number>(DIMENSIONS).fill(1),
        transcriptId: "transcript",
        transcriptVersion: "v1",
        summaryModel: "summary",
        embeddingModel: "embed",
        providedUsageDetails: {},
        usageDetails: {},
        providedCostDetails: {},
        costDetails: {},
        processedAt: new Date().toISOString(),
        metadata: { executionId: execution.id },
      })),
    );
    expect(await tickTopicSnapshotSetup(projectId, execution.id)).toBe(false);
    expect(vi.mocked(enqueueTopicExecution)).toHaveBeenCalledWith(
      projectId,
      execution.id,
    );
    expect(
      await readTopicExecutionSummary(projectId, execution.id),
    ).toMatchObject({
      status: "queued",
      phase: "queued",
      facets: [{ counts: { requested: 3, complete: 3 } }],
    });
    // The fit no longer needs the seeded IDs; only the count stays.
    expect(
      await readTopicSnapshotSummarizing(projectId, execution.id),
    ).toMatchObject({ traceIds: [], seededCount: 3 });
  });
});
