import {
  BatchExportTableName,
  BatchActionType,
  EvalTargetObject,
} from "@langfuse/shared";
import { expect, describe, it, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { handleBatchActionJob } from "../features/batchAction/handleBatchActionJob";
import { getDatabaseReadStreamPaginated } from "../features/database-read-stream/getDatabaseReadStream";
import {
  createOrgProjectAndApiKey,
  createTraceScore,
  createScoresCh,
  createTrace,
  createTracesCh,
  getQueue,
  getScoresByIds,
  QueueJobs,
  QueueName,
  logger,
  createDatasetRunItemsCh,
  createDatasetRunItem,
  createDatasetItem,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { Decimal } from "decimal.js";
import waitForExpect from "wait-for-expect";

describe("select all test suite", () => {
  it("should schedule trace deletions via pending_deletions table", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create test traces
    const traceIds = Array.from({ length: 2500 }).map(() => uuidv4());
    const traces = traceIds.map((id) =>
      createTrace({
        project_id: projectId,
        id,
        timestamp: new Date("2024-01-01").getTime(),
      }),
    );

    await createTracesCh(traces);

    const selectAllJob = {
      payload: {
        projectId,
        actionId: "trace-delete",
        tableName: BatchExportTableName.Traces,
        query: {
          filter: [],
          orderBy: { column: "id", order: "DESC" },
        },
        cutoffCreatedAt: new Date("2024-01-02"),
      },
    } as any;

    await handleBatchActionJob(selectAllJob);

    // Verify pending_deletions records were created for all traces
    const pendingDeletions = await prisma.pendingDeletion.findMany({
      where: {
        projectId,
        object: "trace",
      },
    });

    expect(pendingDeletions).toHaveLength(2500);
    expect(pendingDeletions.every((pd) => pd.isDeleted === false)).toBe(true);

    // Verify all trace IDs are scheduled for deletion
    const scheduledTraceIds = pendingDeletions.map((pd) => pd.objectId).sort();
    expect(scheduledTraceIds).toEqual(traceIds.sort());
  }, 30000);

  it("should schedule only filtered traces for deletion", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId1 = uuidv4();
    const traceId2 = uuidv4();
    const traces = [
      createTrace({
        project_id: projectId,
        id: traceId1,
        user_id: "user1",
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: traceId2,
        user_id: "user2",
        timestamp: new Date("2024-01-01").getTime(),
      }),
    ];

    await createTracesCh(traces);

    const selectAllJob = {
      payload: {
        projectId,
        actionId: "trace-delete",
        tableName: BatchExportTableName.Traces,
        query: {
          filter: [
            {
              type: "string",
              operator: "=",
              column: "User ID",
              value: "user1",
            },
          ],
          orderBy: { column: "timestamp", order: "DESC" },
        },
        cutoffCreatedAt: new Date("2024-01-02"),
      },
    } as any;

    await handleBatchActionJob(selectAllJob);

    // Verify only the filtered trace was scheduled for deletion
    const pendingDeletions = await prisma.pendingDeletion.findMany({
      where: {
        projectId,
        object: "trace",
      },
    });

    expect(pendingDeletions).toHaveLength(1);
    expect(pendingDeletions[0].objectId).toBe(traceId1);
    expect(pendingDeletions[0].isDeleted).toBe(false);
  });

  it("should handle score deletions", async () => {
    // Setup
    const { projectId } = await createOrgProjectAndApiKey();

    const score = createTraceScore({ project_id: projectId });
    await createScoresCh([score]);

    // When
    await handleBatchActionJob({
      id: uuidv4(),
      timestamp: new Date(),
      name: QueueJobs.BatchActionProcessingJob as const,
      payload: {
        projectId,
        actionId: "score-delete",
        tableName: BatchExportTableName.Scores,
        cutoffCreatedAt: new Date(),
        query: {
          filter: null,
          orderBy: { column: "timestamp", order: "DESC" },
        },
        type: BatchActionType.Delete,
      },
    });

    // Then
    const scores = await getScoresByIds(projectId, [score.id]);
    expect(scores).toHaveLength(0);
  });

  it("should schedule only traces matching search query for deletion", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId1 = uuidv4();
    const traceId2 = uuidv4();
    const traces = [
      createTrace({
        project_id: projectId,
        id: traceId1,
        name: "search-target-trace",
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: traceId2,
        name: "other-trace",
        timestamp: new Date("2024-01-01").getTime(),
      }),
    ];

    await createTracesCh(traces);

    const selectAllJob = {
      payload: {
        projectId,
        actionId: "trace-delete",
        tableName: BatchExportTableName.Traces,
        query: {
          filter: [],
          orderBy: { column: "timestamp", order: "DESC" },
          searchQuery: "search-target",
          searchType: ["id"],
        },
        cutoffCreatedAt: new Date("2024-01-02"),
        type: BatchActionType.Delete,
      },
    } as any;

    await handleBatchActionJob(selectAllJob);

    // Verify only the matching trace was scheduled for deletion
    const pendingDeletions = await prisma.pendingDeletion.findMany({
      where: {
        projectId,
        object: "trace",
      },
    });

    expect(pendingDeletions).toHaveLength(1);
    expect(pendingDeletions[0].objectId).toBe(traceId1);
    expect(pendingDeletions[0].isDeleted).toBe(false);
  });

  it("should create eval jobs for historic traces", async () => {
    // remove all jobs from the evaluation execution queue
    const queue = getQueue(QueueName.CreateEvalQueue);
    await queue?.obliterate({ force: true });

    const { projectId } = await createOrgProjectAndApiKey();

    const traceId1 = uuidv4();
    const traces = [
      createTrace({
        project_id: projectId,
        id: traceId1,
        user_id: "user1",
        timestamp: new Date().getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: uuidv4(),
        user_id: "user2",
        timestamp: new Date().getTime(),
      }),
    ];

    await createTracesCh(traces);

    const templateId = uuidv4();

    await prisma.evalTemplate.create({
      data: {
        id: templateId,
        projectId,
        name: "test-template",
        version: 1,
        prompt: "Please evaluate toxicity {{input}} {{output}}",
        model: "gpt-3.5-turbo",
        provider: "openai",
        modelParams: {},
        outputSchema: {
          reasoning: "Please explain your reasoning",
          score: "Please provide a score between 0 and 1",
        },
      },
    });

    const configId = uuidv4();
    await prisma.jobConfiguration.create({
      data: {
        id: configId,
        projectId,
        filter: [
          {
            type: "string",
            value: "1",
            column: "User ID",
            operator: "contains",
          },
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: EvalTargetObject.TRACE,
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: templateId,
      },
    });

    const payload = {
      id: uuidv4(),
      timestamp: new Date(),
      name: QueueJobs.BatchActionProcessingJob as const,
      payload: {
        projectId,
        actionId: "eval-create" as const,
        targetObject: EvalTargetObject.TRACE,
        configId,
        cutoffCreatedAt: new Date(),
        query: {
          filter: [
            {
              type: "string" as const,
              value: "1",
              column: "User ID",
              operator: "contains" as const,
            },
          ],
          orderBy: {
            column: "timestamp",
            order: "DESC" as const,
          },
        },
      },
    };

    await handleBatchActionJob(payload);

    await waitForExpect(async () => {
      try {
        const queue = getQueue(QueueName.CreateEvalQueue);

        const jobs = await queue?.getJobs();

        expect(jobs).toHaveLength(1);

        if (!jobs) {
          throw new Error("No jobs found");
        }

        const job = jobs[0];

        expect(job.name).toBe("create-eval-job");
        expect(job.data.payload.projectId).toBe(projectId);
        expect(job.data.payload.traceId).toBe(traceId1);
        expect(job.data.payload.configId).toBe(configId);
      } catch (e) {
        logger.error(e);
        throw e;
      }
    });
  });

  it("should create eval jobs for historic datasets", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId1 = uuidv4();
    const traceId2 = uuidv4();

    const traces = [
      createTrace({
        project_id: projectId,
        id: traceId1,
        user_id: "user1",
        timestamp: new Date().getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: traceId2,
        user_id: "user2",
        timestamp: new Date().getTime(),
      }),
    ];

    await createTracesCh(traces);

    const datasetName = uuidv4();
    const dataset = await prisma.dataset.create({
      data: {
        id: uuidv4(),
        projectId,
        name: datasetName,
      },
    });

    const res1 = await createDatasetItem({
      projectId,
      datasetId: dataset.id,
      input: "Hello, world!",
    });

    const res2 = await createDatasetItem({
      projectId,
      datasetId: dataset.id,
      input: "Hello, world!",
    });

    if (!res1.success || !res2.success) {
      throw new Error("Failed to create dataset item");
    }
    const datasetItem1 = res1.datasetItem;
    const datasetItem2 = res2.datasetItem;

    const runId = uuidv4();

    await prisma.datasetRuns.create({
      data: {
        id: runId,
        datasetId: dataset.id,
        projectId,
        name: "test-run",
      },
    });

    const datasetRunItem1 = createDatasetRunItem({
      id: uuidv4(),
      dataset_item_id: datasetItem1.id,
      project_id: projectId,
      trace_id: traceId1,
      dataset_run_id: runId,
      dataset_id: dataset.id,
    });

    const datasetRunItem2 = createDatasetRunItem({
      id: uuidv4(),
      dataset_item_id: datasetItem2.id,
      project_id: projectId,
      trace_id: traceId2,
      dataset_run_id: runId,
      dataset_id: dataset.id,
    });

    await createDatasetRunItemsCh([datasetRunItem1, datasetRunItem2]);

    // Create clickhouse run items
    await createDatasetRunItemsCh([
      createDatasetRunItem({
        project_id: projectId,
        dataset_id: dataset.id,
        dataset_run_id: runId,
        dataset_item_id: datasetItem1.id,
        trace_id: traceId1,
      }),
      createDatasetRunItem({
        project_id: projectId,
        dataset_id: dataset.id,
        dataset_run_id: runId,
        dataset_item_id: datasetItem2.id,
        trace_id: traceId2,
      }),
    ]);

    const templateId = uuidv4();

    await prisma.evalTemplate.create({
      data: {
        id: templateId,
        projectId,
        name: "test-template",
        version: 1,
        prompt: "Please evaluate toxicity {{input}} {{output}}",
        model: "gpt-3.5-turbo",
        provider: "openai",
        modelParams: {},
        outputSchema: {
          reasoning: "Please explain your reasoning",
          score: "Please provide a score between 0 and 1",
        },
      },
    });

    const configId = uuidv4();
    await prisma.jobConfiguration.create({
      data: {
        id: configId,
        projectId,
        filter: [
          {
            type: "stringOptions" as const,
            value: [dataset.id],
            column: "Dataset",
            operator: "any of" as const,
          },
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: EvalTargetObject.DATASET,
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: templateId,
      },
    });

    const queue = getQueue(QueueName.CreateEvalQueue);
    await queue?.obliterate({ force: true });

    const payload = {
      id: uuidv4(),
      timestamp: new Date(),
      name: QueueJobs.BatchActionProcessingJob as const,
      payload: {
        projectId,
        actionId: "eval-create" as const,
        targetObject: EvalTargetObject.DATASET,
        configId,
        cutoffCreatedAt: new Date(),
        query: {
          filter: [
            {
              type: "stringOptions" as const,
              value: [dataset.id],
              column: "Dataset",
              operator: "any of" as const,
            },
          ],
          orderBy: {
            column: "timestamp",
            order: "DESC" as const,
          },
        },
      },
    };

    await handleBatchActionJob(payload);

    await waitForExpect(async () => {
      try {
        const jobs = await queue?.getJobs();
        expect(jobs).toHaveLength(2);
        const jobTraceIds = jobs?.map((job) => job.data.payload.traceId);
        expect(jobTraceIds).toContain(traceId1);
        expect(jobTraceIds).toContain(traceId2);

        const jobDatasetIds = jobs?.map(
          (job) => job.data.payload.datasetItemId,
        );
        expect(jobDatasetIds).toContain(datasetItem1.id);
        expect(jobDatasetIds).toContain(datasetItem2.id);
        const configIds = jobs?.map((job) => job.data.payload.configId);
        expect(configIds).toContain(configId);
      } catch (e) {
        logger.error(e);
        throw e;
      }
    });
  });

  it("should not create evals if config does not exist", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create a trace
    const traceId = uuidv4();
    await createTracesCh([
      createTrace({
        project_id: projectId,
        id: traceId,
        timestamp: new Date("2024-01-01").getTime(),
      }),
    ]);

    // Use a non-existent config ID
    const nonExistentConfigId = uuidv4();

    const queue = getQueue(QueueName.CreateEvalQueue);
    // Clear any existing jobs
    await queue?.obliterate({ force: true });

    const payload = {
      id: uuidv4(),
      timestamp: new Date(),
      name: QueueJobs.BatchActionProcessingJob as const,
      payload: {
        projectId,
        actionId: "eval-create" as const,
        targetObject: EvalTargetObject.TRACE,
        configId: nonExistentConfigId,
        cutoffCreatedAt: new Date(),
        query: {
          filter: [],
          orderBy: {
            column: "timestamp",
            order: "DESC" as const,
          },
        },
      },
    };

    // This should not throw
    await expect(handleBatchActionJob(payload)).resolves.not.toThrow();

    // Verify no jobs were created
    await waitForExpect(async () => {
      const jobs = await queue?.getJobs();
      expect(jobs).toHaveLength(0);
    });
  });
});
