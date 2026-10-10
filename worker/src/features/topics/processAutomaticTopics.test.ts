import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicAutomaticJob } from "@langfuse/shared/src/server";
import type { TopicRun, TopicSummary } from "@langfuse/shared/topics";
import { env } from "@langfuse/shared/src/env";
import { AutomaticTopicsQueue } from "@langfuse/shared/topics/server";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  models: vi.fn(),
  project: vi.fn(),
  facets: vi.fn(),
  maps: vi.fn(),
  publishedMaps: vi.fn(),
  publishedRun: vi.fn(),
  run: vi.fn(),
  summaries: vi.fn(),
  counts: vi.fn(),
  cohort: vi.fn(),
  assignments: vi.fn(),
  write: vi.fn(),
  enqueue: vi.fn(),
  create: vi.fn(),
  execution: vi.fn(),
  process: vi.fn(),
  register: vi.fn(),
}));
vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    project: { findUnique: mocks.project },
    topicClusteringRun: { findMany: mocks.publishedMaps },
  },
}));
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  AutomaticTopicsQueue: (
    await importOriginal<typeof import("@langfuse/shared/topics/server")>()
  ).AutomaticTopicsQueue,
  isTopicsProjectEnabled: mocks.enabled,
  getTopicsModelConfig: mocks.models,
  listTopicFacets: mocks.facets,
  getTopicProcessingMapIds: mocks.maps,
  getTopicRun: mocks.run,
  getPublishedTopicRun: mocks.publishedRun,
  listTopicSummaries: mocks.summaries,
  getTopicSummaryCounts: mocks.counts,
  getTopicClusteringSummaries: mocks.cohort,
  readTopicAssignments: mocks.assignments,
  writeTopicAssignments: mocks.write,
  enqueueAutomaticTopicDiscovery: mocks.enqueue,
  createAutomaticTopicExecution: mocks.create,
  readTopicExecutionSummary: mocks.execution,
  registerTopicExecutionQueueJob: mocks.register,
}));
vi.mock("./processTopicsExecution", () => ({
  processTopicsExecution: mocks.process,
}));
vi.mock("../../queues/topicsQueue", () => ({
  topicsQueueProcessor: vi.fn(),
}));
import { processAutomaticTopics } from "./processAutomaticTopics";
import { topicsUpdateQueueProcessor } from "../../queues/topicsUpdateQueue";

const timeRange = {
  from: new Date("2026-09-29T12:00:00Z"),
  to: new Date("2026-10-06T12:00:00Z"),
};
const facet = { facetId: "facet", version: 2 };
const embeddingConfig = {
  embeddingModel: "embedding-model",
  embeddingDimensions: 1024,
};
const summary = (traceId = "trace"): TopicSummary => ({
  projectId: "project",
  facetId: "facet",
  facetVersion: 2,
  traceId,
  sessionId: null,
  unitStartTime: "2026-10-06T11:00:00.000Z",
  processedAt: "2026-10-06T11:30:00.000Z",
  state: "complete",
  summary: "Password reset",
  embedding: Array.from({ length: 1024 }, (_, i) => Number(i === 0)),
  embeddingModel: "embedding-model",
  summaryModel: "summary-model",
  triggerType: "manual_poc",
  transcriptId: "trace-batch",
  transcriptVersion: 1,
  environment: "test",
  traceName: "help",
  metadata: {},
  providedUsageDetails: {},
  usageDetails: {},
  providedCostDetails: {},
  costDetails: {},
});
const run = (): TopicRun => ({
  id: "run",
  projectId: "project",
  facetId: "facet",
  facetVersion: 2,
  status: "completed",
  createdAt: timeRange.to.toISOString(),
  startedAt: null,
  finishedAt: timeRange.to.toISOString(),
  config: { embeddingModel: "embedding-model", dimensions: 1024 },
  error: null,
  topics: [],
});
const job = (traceIds?: string[]): TopicAutomaticJob => ({
  id: "automatic-job",
  name: "topics-automatic",
  timestamp: timeRange.to,
  payload: {
    projectId: "project",
    timeRange,
    ...(traceIds
      ? { traceIds }
      : { facets: [facet], executionId: "execution" }),
  },
});
const connection = env.REDIS_CONNECTION_STRING
  ? { url: env.REDIS_CONNECTION_STRING }
  : {
      host: env.REDIS_HOST ?? "localhost",
      port: env.REDIS_PORT ?? 6379,
      password: env.REDIS_AUTH ?? undefined,
      username: env.REDIS_USERNAME ?? undefined,
    };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(timeRange.to);
  mocks.enabled.mockReturnValue(true);
  mocks.models.mockReturnValue({
    summaryModel: "summary-model",
    embeddingModel: "embedding-model",
  });
  mocks.project.mockResolvedValue({ id: "project" });
  mocks.facets.mockResolvedValue([{ id: "facet", versions: [{ version: 2 }] }]);
  mocks.maps.mockResolvedValue([
    { facetId: "facet", facetVersion: 2, runId: null },
  ]);
  mocks.publishedMaps.mockResolvedValue([]);
  mocks.publishedRun.mockResolvedValue(null);
  mocks.summaries.mockResolvedValue([summary()]);
  mocks.assignments.mockResolvedValue([]);
  mocks.cohort.mockResolvedValue([summary()]);
  mocks.run.mockResolvedValue(run());
  mocks.counts.mockResolvedValue([
    { facetId: "facet", facetVersion: 2, count: 99 },
  ]);
  mocks.create.mockResolvedValue({ id: "execution" });
  mocks.process.mockImplementation(async ({ beforeComplete }) => {
    await beforeComplete?.();
  });
  mocks.execution.mockResolvedValue({
    status: "completed",
    facets: [],
    error: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("automatic Topics", () => {
  it("discovers arrivals coalesced while an earlier discovery waits in retry backoff", async () => {
    const queue = new Queue<TopicAutomaticJob>(
      `topics-delayed-discovery-test-${randomUUID()}`,
      {
        connection,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: "fixed", delay: 60_000 },
          deduplication: { id: "project-facet", keepLastIfActive: true },
        },
      },
    );
    const arrivedAt = timeRange.to.getTime() + 500;
    vi.spyOn(AutomaticTopicsQueue, "getInstance").mockReturnValue(queue);
    mocks.counts
      .mockRejectedValueOnce(new Error("Temporary summary read failure"))
      .mockImplementation(async (_project, _facets, _config, range) => [
        {
          facetId: facet.facetId,
          facetVersion: facet.version,
          count: range.to.getTime() > arrivedAt ? 100 : 99,
        },
      ]);
    const worker = new Worker<TopicAutomaticJob>(
      queue.name,
      topicsUpdateQueueProcessor,
      { connection },
    );
    const failed = new Promise<void>((resolve) =>
      worker.once("failed", () => resolve()),
    );
    const completed = new Promise<void>((resolve) =>
      worker.once("completed", () => resolve()),
    );
    try {
      const first = await queue.add("topics-automatic", job());
      await failed;
      expect(await first.getState()).toBe("delayed");
      vi.setSystemTime(timeRange.to.getTime() + 1000);
      const arrival = job();
      arrival.payload.timeRange = {
        from: new Date(Date.now() - 7 * 86400000),
        to: new Date(),
      };
      await queue.add("topics-automatic", arrival);
      await first.promote();
      await completed;
      expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ timeRange: arrival.payload.timeRange }),
      );
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });

  it.each(["resumed", "new"])(
    "serializes resumed discovery with new arrivals when %s job owns the facet first",
    async (firstOwner) => {
      const queue = new Queue<TopicAutomaticJob>(
        `topics-resume-exclusion-test-${randomUUID()}`,
        {
          connection,
          defaultJobOptions: {
            deduplication: { id: "project-facet", keepLastIfActive: true },
          },
        },
      );
      vi.spyOn(AutomaticTopicsQueue, "getInstance").mockReturnValue(queue);
      mocks.counts.mockResolvedValue([
        { facetId: "facet", facetVersion: 2, count: 100 },
      ]);
      let release: (() => void) | undefined;
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started: (() => void) | undefined;
      const active = new Promise<void>((resolve) => {
        started = resolve;
      });
      mocks.process
        .mockRejectedValueOnce(new Error("Naming failed"))
        .mockImplementation(async () => {
          started!();
          await hold;
        });
      const worker = new Worker<TopicAutomaticJob>(
        queue.name,
        topicsUpdateQueueProcessor,
        { connection, concurrency: 2 },
      );
      const failed = new Promise<void>((resolve) =>
        worker.once("failed", () => resolve()),
      );
      try {
        const original = await queue.add("topics-automatic", job());
        await failed;
        expect(await queue.getDeduplicationJobId("project-facet")).toBeNull();
        const frozen = (await queue.getJob(original.id!))!.data.updateInput;
        if (firstOwner === "resumed") await original.retry("failed");
        else
          await queue.add("topics-automatic", {
            ...job(),
            id: "new-discovery",
          });
        await active;
        if (firstOwner === "resumed") {
          await queue.add("topics-automatic", {
            ...job(),
            id: "new-discovery",
          });
          const counts = await queue.getJobCounts("active", "waiting");
          expect(counts.active + counts.waiting).toBe(1);
        } else {
          await original.retry("failed");
          await expect.poll(() => original.getState()).toBe("delayed");
          expect(mocks.process).toHaveBeenCalledTimes(2);
        }
        expect((await queue.getJob(original.id!))!.data.updateInput).toEqual(
          frozen,
        );
        const completed = new Promise<void>((resolve) =>
          worker.once("completed", () => resolve()),
        );
        release!();
        await completed;
        if (firstOwner === "new") await original.promote();
        await expect.poll(() => queue.getCompletedCount()).toBe(2);
        expect(mocks.process).toHaveBeenCalledTimes(3);
      } finally {
        release!();
        await worker.close();
        await queue.obliterate({ force: true });
        await queue.close();
      }
    },
  );

  it.each([99, 100])(
    "discovers only after the standard threshold: %i",
    async (count) => {
      mocks.publishedMaps.mockResolvedValue([
        { facetId: "facet", facetVersion: 1 },
      ]);
      mocks.counts.mockResolvedValue([
        { facetId: "facet", facetVersion: 2, count },
      ]);
      const save = vi.fn();
      await processAutomaticTopics(job(), save);
      expect(mocks.create).toHaveBeenCalledTimes(count === 100 ? 1 : 0);
      expect(mocks.process).toHaveBeenCalledTimes(count === 100 ? 1 : 0);
      if (count === 100) {
        expect(save).toHaveBeenCalledBefore(mocks.create);
        expect(mocks.create).toHaveBeenCalledWith(
          expect.objectContaining({
            operation: "update",
            exploratory: false,
            minimumTraceCount: 100,
            facets: [facet],
            timeRange,
          }),
        );
      }
    },
  );

  it.each(["ingest", "discovery"])(
    "preserves an incompatible published map for the current facet version during %s",
    async (path) => {
      mocks.publishedMaps.mockResolvedValue([
        { facetId: "facet", facetVersion: 2 },
      ]);
      mocks.counts.mockResolvedValue([
        { facetId: "facet", facetVersion: 2, count: 100 },
      ]);
      const save = vi.fn();
      await processAutomaticTopics(
        job(path === "ingest" ? ["trace"] : undefined),
        save,
      );
      expect(mocks.enqueue).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.process).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    },
  );

  it("assigns an ingest batch when a compatible map publishes between metadata reads", async () => {
    mocks.maps
      .mockResolvedValueOnce([
        { facetId: "facet", facetVersion: 2, runId: null },
      ])
      .mockResolvedValue([{ facetId: "facet", facetVersion: 2, runId: "run" }]);
    mocks.publishedMaps.mockResolvedValue([
      { facetId: "facet", facetVersion: 2 },
    ]);
    mocks.summaries.mockResolvedValue([summary("arrived-during-publication")]);
    await processAutomaticTopics(job(["arrived-during-publication"]), vi.fn());
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        runId: "run",
        traceId: "arrived-during-publication",
        origin: "online",
      }),
    ]);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "assigns recovered summaries only while their accepted map serves (%s)",
    async (serving) => {
      const acceptedFacet = { facetId: "facet", version: 1 };
      const acceptedEmbedding = {
        embeddingModel: "accepted-model",
        embeddingDimensions: 512,
      };
      const data = job(["recovered"]);
      data.payload.facets = [acceptedFacet];
      data.payload.embeddingConfig = acceptedEmbedding;
      mocks.maps.mockImplementation(async (_project, refs, config) =>
        refs.map((ref: typeof acceptedFacet) => ({
          facetId: ref.facetId,
          facetVersion: ref.version,
          runId:
            serving &&
            ref.version === 1 &&
            config.embeddingModel === acceptedEmbedding.embeddingModel &&
            config.embeddingDimensions === acceptedEmbedding.embeddingDimensions
              ? "run"
              : null,
        })),
      );
      mocks.summaries.mockResolvedValue([
        {
          ...summary("recovered"),
          facetVersion: 1,
          embeddingModel: acceptedEmbedding.embeddingModel,
          embedding: Array.from(
            { length: acceptedEmbedding.embeddingDimensions },
            (_, i) => Number(i === 0),
          ),
        },
      ]);
      mocks.run.mockResolvedValue({
        ...run(),
        facetVersion: 1,
        config: {
          embeddingModel: acceptedEmbedding.embeddingModel,
          dimensions: acceptedEmbedding.embeddingDimensions,
        },
      });
      await topicsUpdateQueueProcessor({
        data,
        updateData: vi.fn(),
      } as unknown as Parameters<typeof topicsUpdateQueueProcessor>[0]);
      expect(mocks.write).toHaveBeenCalledTimes(serving ? 1 : 0);
      if (serving)
        expect(mocks.write).toHaveBeenCalledWith([
          expect.objectContaining({
            facetVersion: 1,
            traceId: "recovered",
            runId: "run",
          }),
        ]);
      expect(mocks.enqueue).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );

  it("does not bootstrap accepted summaries under an obsolete embedding configuration", async () => {
    const data = job(["recovered"]);
    data.payload.facets = [facet];
    data.payload.embeddingConfig = {
      ...embeddingConfig,
      embeddingModel: "old-model",
    };
    mocks.summaries.mockResolvedValue([
      { ...summary("recovered"), embeddingModel: "old-model" },
    ]);
    await processAutomaticTopics(data, vi.fn());
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("assigns a later batch to an empty published map as outliers without another fit", async () => {
    mocks.maps.mockResolvedValue([
      { facetId: "facet", facetVersion: 2, runId: "run" },
    ]);
    await processAutomaticTopics(job(["trace"]), vi.fn());
    expect(mocks.write).toHaveBeenCalledWith([
      expect.objectContaining({
        runId: "run",
        topicId: null,
        origin: "online",
        traceId: "trace",
        summaryProcessedAt: summary().processedAt,
      }),
    ]);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.cohort).not.toHaveBeenCalled();
  });

  it("enqueues discovery for a current batch without a compatible map", async () => {
    const data = job(["trace"]);
    data.payload.facets = [facet];
    data.payload.embeddingConfig = embeddingConfig;
    await processAutomaticTopics(data, vi.fn());
    expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith("project", [facet]);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("assigns summaries left outside the initial publication to its discovered topic", async () => {
    mocks.counts.mockResolvedValue([
      { facetId: "facet", facetVersion: 2, count: 100 },
    ]);
    const published = run();
    published.topics = [
      {
        topicVersionId: "topic-version",
        projectId: "project",
        topicId: "topic",
        createdByRunId: "run",
        createdAt: timeRange.to.toISOString(),
        tags: [],
        name: "Password resets",
        description: "Account recovery requests",
        centroid: summary().embedding,
        radius: 0.1,
        representativeSummaries: [],
        metadata: {},
      },
    ];
    mocks.run.mockResolvedValue(published);
    mocks.process.mockImplementation(async ({ beforeComplete }) => {
      mocks.maps.mockResolvedValue([
        { facetId: "facet", facetVersion: 2, runId: "run" },
      ]);
      await beforeComplete?.();
    });
    mocks.cohort.mockResolvedValue([summary("initial"), summary("late")]);
    mocks.assignments.mockResolvedValue([
      { traceId: "initial", summaryProcessedAt: summary().processedAt },
    ]);
    await processAutomaticTopics(job(), vi.fn());
    expect(mocks.write).toHaveBeenCalledWith([
      expect.objectContaining({
        traceId: "late",
        topicId: "topic",
        topicVersionId: "topic-version",
        origin: "online",
        distance: 0,
      }),
    ]);
  });

  it("ignores incomplete, incompatible and outside-window summaries", async () => {
    mocks.maps.mockResolvedValue([
      { facetId: "facet", facetVersion: 2, runId: "run" },
    ]);
    mocks.summaries.mockResolvedValue([
      { ...summary(), state: "not_applicable" },
      { ...summary(), embeddingModel: "old-model" },
      { ...summary(), embedding: [1, 0] },
      { ...summary(), facetVersion: 1 },
      { ...summary(), unitStartTime: "2026-09-20T00:00:00.000Z" },
    ]);
    await processAutomaticTopics(job(["trace"]), vi.fn());
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "catches up queued old facet/model scope only while its map serves (%s)",
    async (serving) => {
      const queuedFacet = { facetId: "facet", version: 1 };
      const servingEmbedding = {
        embeddingModel: "original-model",
        embeddingDimensions: 512,
      };
      const published = {
        ...run(),
        facetVersion: serving ? 1 : 2,
        config: {
          embeddingModel: servingEmbedding.embeddingModel,
          dimensions: servingEmbedding.embeddingDimensions,
        },
      };
      const row = {
        ...summary("arrived-during-fit"),
        facetVersion: queuedFacet.version,
        embeddingModel: servingEmbedding.embeddingModel,
        embedding: Array.from(
          { length: servingEmbedding.embeddingDimensions },
          (_, index) => Number(index === 0),
        ),
      };
      const data = job();
      data.payload.facets = [queuedFacet];
      mocks.publishedMaps.mockResolvedValue([
        { facetId: "facet", facetVersion: published.facetVersion },
      ]);
      mocks.publishedRun.mockResolvedValue(published);
      mocks.run.mockResolvedValue(published);
      mocks.cohort.mockResolvedValue([row]);
      mocks.counts.mockResolvedValue([
        { facetId: "facet", facetVersion: queuedFacet.version, count: 100 },
      ]);
      await processAutomaticTopics(data, vi.fn());
      expect(mocks.write).toHaveBeenCalledTimes(serving ? 1 : 0);
      if (serving) {
        expect(mocks.write).toHaveBeenCalledWith([
          expect.objectContaining({
            facetVersion: queuedFacet.version,
            traceId: "arrived-during-fit",
            runId: "run",
          }),
        ]);
      }
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.enqueue).not.toHaveBeenCalled();
    },
  );

  it("discovers under the current model when a queued follow-up has no serving map", async () => {
    mocks.models.mockReturnValue({
      summaryModel: "summary-model",
      embeddingModel: "new-model",
    });
    mocks.counts.mockResolvedValue([
      { facetId: "facet", facetVersion: 2, count: 100 },
    ]);
    await processAutomaticTopics(job(), vi.fn());
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        facets: [facet],
        embeddingConfig: { ...embeddingConfig, embeddingModel: "new-model" },
      }),
    );
  });

  it("fits only the requested facet when other missing facets also reach the threshold", async () => {
    mocks.facets.mockResolvedValue([
      { id: "facet", versions: [{ version: 2 }] },
      { id: "issues", versions: [{ version: 1 }] },
    ]);
    mocks.maps.mockResolvedValue([
      { facetId: "facet", facetVersion: 2, runId: null },
      { facetId: "issues", facetVersion: 1, runId: null },
    ]);
    mocks.counts.mockResolvedValue([
      { facetId: "facet", facetVersion: 2, count: 100 },
      { facetId: "issues", facetVersion: 1, count: 100 },
    ]);
    const data = job();
    data.payload.facets = [{ facetId: "issues", version: 1 }];
    await processAutomaticTopics(data, vi.fn());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ facets: [{ facetId: "issues", version: 1 }] }),
    );
  });

  it("keeps the accepted update input on retry and surfaces failed executions", async () => {
    const data = job();
    data.updateInput = {
      operation: "update",
      projectId: "project",
      requestId: "saved",
      facets: [facet],
      embeddingConfig,
      timeRange,
      exploratory: false,
    };
    mocks.execution.mockResolvedValue({
      status: "failed",
      error: "Naming unavailable",
      facets: [],
    });
    await expect(processAutomaticTopics(data, vi.fn())).rejects.toThrow(
      "Naming unavailable",
    );
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(data.updateInput);
    expect(mocks.counts).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "resumes catch-up for the accepted facet version after a new version exists (still serving: %s)",
    async (stillServing) => {
      vi.setSystemTime(timeRange.to.getTime() + 60_000);
      const acceptedFacet = { facetId: "facet", version: 1 };
      const acceptedEmbedding = {
        embeddingModel: "accepted-model",
        embeddingDimensions: 512,
      };
      const data = job();
      data.payload.facets = [acceptedFacet];
      data.updateInput = {
        operation: "update",
        projectId: "project",
        requestId: "saved",
        facets: [acceptedFacet],
        embeddingConfig: acceptedEmbedding,
        timeRange,
        exploratory: false,
      };
      mocks.facets.mockResolvedValue([
        { id: "facet", versions: [{ version: 1 }] },
      ]);
      let serving = true;
      mocks.maps.mockImplementation(async (_project, requested, config) =>
        requested.map((ref: typeof acceptedFacet) => ({
          facetId: ref.facetId,
          facetVersion: ref.version,
          runId:
            ref.version === 1 &&
            serving &&
            config.embeddingModel === acceptedEmbedding.embeddingModel &&
            config.embeddingDimensions === acceptedEmbedding.embeddingDimensions
              ? "run"
              : null,
        })),
      );
      mocks.run.mockResolvedValue({
        ...run(),
        facetVersion: 1,
        config: { embeddingModel: "accepted-model", dimensions: 512 },
      });
      mocks.cohort.mockResolvedValue([
        {
          ...summary("unassigned"),
          unitStartTime: new Date(
            timeRange.to.getTime() + 30_000,
          ).toISOString(),
          facetVersion: 1,
          embeddingModel: "accepted-model",
          embedding: Array.from({ length: 512 }, (_, index) =>
            Number(index === 0),
          ),
        },
      ]);
      mocks.write.mockRejectedValueOnce(new Error("Catch-up write failed"));
      const save = vi.fn();
      await expect(processAutomaticTopics(data, save)).rejects.toThrow(
        "Catch-up write failed",
      );
      mocks.facets.mockResolvedValue([
        { id: "facet", versions: [{ version: 2 }, { version: 1 }] },
      ]);
      serving = stillServing;
      await processAutomaticTopics(data, save);
      expect(mocks.write).toHaveBeenCalledTimes(stillServing ? 2 : 1);
      if (stillServing)
        expect(mocks.write).toHaveBeenLastCalledWith([
          expect.objectContaining({
            facetVersion: 1,
            traceId: "unassigned",
            runId: "run",
          }),
        ]);
      expect(mocks.create).toHaveBeenLastCalledWith(data.updateInput);
      expect(save).not.toHaveBeenCalled();
      expect(mocks.counts).not.toHaveBeenCalled();
      expect(mocks.publishedRun).not.toHaveBeenCalled();
    },
  );

  it("skips disabled and deleted projects before reading summaries", async () => {
    mocks.enabled.mockReturnValueOnce(false);
    await processAutomaticTopics(job(), vi.fn());
    expect(mocks.project).not.toHaveBeenCalled();
    mocks.project.mockResolvedValue(null);
    await processAutomaticTopics(job(), vi.fn());
    expect(mocks.facets).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
