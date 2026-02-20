import {
  BatchExportTableName,
  BatchActionType,
  BatchTableNames,
  BatchActionStatus,
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
  createEvent,
  createEventsCh,
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

const maybeDescribe =
  process.env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true"
    ? describe
    : describe.skip;

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

maybeDescribe("events table batch actions", () => {
  it("should add observations to dataset from events table with full mapping", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = uuidv4();
    const trace = createTrace({
      project_id: projectId,
      id: traceId,
      timestamp: new Date().getTime(),
    });
    await createTracesCh([trace]);

    const eventInput1 = { prompt: "Hello, how are you?" };
    const eventOutput1 = { response: "I'm fine, thank you!" };
    const eventInput2 = { prompt: "What is 2+2?" };
    const eventOutput2 = { response: "4" };

    const event1 = createEvent({
      project_id: projectId,
      trace_id: traceId,
      input: eventInput1,
      output: eventOutput1,
      metadata: { source: "test" },
    });
    const event2 = createEvent({
      project_id: projectId,
      trace_id: traceId,
      input: eventInput2,
      output: eventOutput2,
      metadata: { source: "test" },
    });

    await createEventsCh([event1, event2]);

    const datasetName = uuidv4();
    const dataset = await prisma.dataset.create({
      data: {
        id: uuidv4(),
        projectId,
        name: datasetName,
      },
    });

    const batchAction = await prisma.batchAction.create({
      data: {
        projectId,
        userId: "test-user",
        actionType: "observation-add-to-dataset",
        tableName: BatchTableNames.Events,
        status: BatchActionStatus.Queued,
        query: { filter: [], orderBy: null },
      },
    });

    await handleBatchActionJob({
      id: uuidv4(),
      timestamp: new Date(),
      name: QueueJobs.BatchActionProcessingJob as const,
      payload: {
        batchActionId: batchAction.id,
        projectId,
        actionId: "observation-add-to-dataset" as const,
        tableName: BatchTableNames.Events,
        cutoffCreatedAt: new Date(),
        query: { filter: [], orderBy: null },
        config: {
          datasetId: dataset.id,
          datasetName: dataset.name,
          mapping: {
            input: { mode: "full" as const },
            expectedOutput: { mode: "full" as const },
            metadata: { mode: "none" as const },
          },
        },
        type: BatchActionType.Create,
      },
    });

    const datasetItems = await prisma.datasetItem.findMany({
      where: { datasetId: dataset.id },
    });

    expect(datasetItems).toHaveLength(2);

    const eventSpanIds = [event1.span_id, event2.span_id];
    for (const item of datasetItems) {
      expect(eventSpanIds).toContain(item.sourceObservationId);
      expect(item.sourceTraceId).toBe(traceId);
      expect(item.metadata).toBeNull();
    }

    // Verify each item's input/output matches the corresponding event
    const item1 = datasetItems.find(
      (i) => i.sourceObservationId === event1.span_id,
    );
    const item2 = datasetItems.find(
      (i) => i.sourceObservationId === event2.span_id,
    );

    expect(item1?.input).toEqual(eventInput1);
    expect(item1?.expectedOutput).toEqual(eventOutput1);
    expect(item2?.input).toEqual(eventInput2);
    expect(item2?.expectedOutput).toEqual(eventOutput2);

    // Verify batch action status
    const updatedBatchAction = await prisma.batchAction.findUnique({
      where: { id: batchAction.id },
    });
    expect(updatedBatchAction?.status).toBe(BatchActionStatus.Completed);
    expect(updatedBatchAction?.processedCount).toBe(2);
  });

  it("should apply jsonSelector mapping when adding events to dataset", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = uuidv4();
    const trace = createTrace({
      project_id: projectId,
      id: traceId,
      timestamp: new Date().getTime(),
    });
    await createTracesCh([trace]);

    const eventInput = {
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "What is 2+2?" },
      ],
    };
    const eventOutput = {
      choices: [{ message: { content: "4", role: "assistant" } }],
    };
    const eventMetadata = { user_id: "user-123", session_id: "session-456" };

    const event = createEvent({
      project_id: projectId,
      trace_id: traceId,
      input: eventInput,
      output: eventOutput,
      metadata: eventMetadata,
    });

    await createEventsCh([event]);

    const datasetName = uuidv4();
    const dataset = await prisma.dataset.create({
      data: {
        id: uuidv4(),
        projectId,
        name: datasetName,
      },
    });

    const batchAction = await prisma.batchAction.create({
      data: {
        projectId,
        userId: "test-user",
        actionType: "observation-add-to-dataset",
        tableName: BatchTableNames.Events,
        status: BatchActionStatus.Queued,
        query: { filter: [], orderBy: null },
      },
    });

    await handleBatchActionJob({
      id: uuidv4(),
      timestamp: new Date(),
      name: QueueJobs.BatchActionProcessingJob as const,
      payload: {
        batchActionId: batchAction.id,
        projectId,
        actionId: "observation-add-to-dataset" as const,
        tableName: BatchTableNames.Events,
        cutoffCreatedAt: new Date(),
        query: { filter: [], orderBy: null },
        config: {
          datasetId: dataset.id,
          datasetName: dataset.name,
          mapping: {
            input: {
              mode: "custom" as const,
              custom: {
                type: "keyValueMap" as const,
                keyValueMapConfig: {
                  entries: [
                    {
                      id: "1",
                      key: "prompt",
                      sourceField: "input" as const,
                      value: "$.messages[1].content",
                    },
                    {
                      id: "2",
                      key: "system",
                      sourceField: "input" as const,
                      value: "$.messages[0].content",
                    },
                  ],
                },
              },
            },
            expectedOutput: {
              mode: "custom" as const,
              custom: {
                type: "root" as const,
                rootConfig: {
                  sourceField: "output" as const,
                  jsonPath: "$.choices[0].message.content",
                },
              },
            },
            metadata: {
              mode: "custom" as const,
              custom: {
                type: "keyValueMap" as const,
                keyValueMapConfig: {
                  entries: [
                    {
                      id: "3",
                      key: "user",
                      sourceField: "metadata" as const,
                      value: "$.user_id",
                    },
                  ],
                },
              },
            },
          },
        },
        type: BatchActionType.Create,
      },
    });

    const datasetItems = await prisma.datasetItem.findMany({
      where: { datasetId: dataset.id },
    });

    expect(datasetItems).toHaveLength(1);

    const item = datasetItems[0];
    expect(item.sourceObservationId).toBe(event.span_id);
    expect(item.sourceTraceId).toBe(traceId);
    expect(item.input).toEqual({
      prompt: "What is 2+2?",
      system: "You are helpful.",
    });
    // The jsonPath extracts the string "4" from output, but it's stored as a
    // JSON scalar in Postgres. Prisma deserializes the JSON column as a number.
    expect(item.expectedOutput).toBe(4);
    expect(item.metadata).toEqual({ user: "user-123" });

    // Verify batch action status
    const updatedBatchAction = await prisma.batchAction.findUnique({
      where: { id: batchAction.id },
    });
    expect(updatedBatchAction?.status).toBe(BatchActionStatus.Completed);
    expect(updatedBatchAction?.processedCount).toBe(1);
  });
});
