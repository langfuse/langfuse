import { BatchExportTableName } from "@langfuse/shared";
import { expect, describe, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { handleBatchActionJob } from "../features/batchAction/handleBatchActionJob";
import { getDatabaseReadStream } from "../features/batchExport/handleBatchExportJob";
import {
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { Decimal } from "decimal.js";
import waitForExpect from "wait-for-expect";

describe("select all test suite", () => {
  it("should process items in chunks", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create test traces
    const traces = Array.from({ length: 2500 }).map(() =>
      createTrace({
        project_id: projectId,
        id: randomUUID(),
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
          orderBy: { column: "timestamp", order: "DESC" },
        },
        cutoffCreatedAt: new Date("2024-01-02"),
      },
    } as any;

    await handleBatchActionJob(selectAllJob);

    // Verify traces were deleted
    const stream = await getDatabaseReadStream({
      projectId,
      tableName: BatchExportTableName.Traces,
      cutoffCreatedAt: new Date("2024-01-02"),
      filter: [],
      orderBy: { column: "timestamp", order: "DESC" },
    });

    const remainingRows: any[] = [];
    for await (const chunk of stream) {
      remainingRows.push(chunk);
    }
    expect(remainingRows).toHaveLength(0);
  });

  it("should handle filtered queries", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        user_id: "user1",
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
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

    // Verify only filtered traces were processed
    const stream = await getDatabaseReadStream({
      projectId,
      tableName: BatchExportTableName.Traces,
      cutoffCreatedAt: new Date("2024-01-02"),
      filter: [],
      orderBy: { column: "timestamp", order: "DESC" },
    });

    const remainingRows: any[] = [];
    for await (const chunk of stream) {
      remainingRows.push(chunk);
    }
    expect(remainingRows).toHaveLength(1);
    expect(remainingRows[0].userId).toBe("user2");
  });

  it("should create eval jobs for historic traces", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId1 = randomUUID();
    const traces = [
      createTrace({
        project_id: projectId,
        id: traceId1,
        user_id: "user1",
        timestamp: new Date().getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        user_id: "user2",
        timestamp: new Date().getTime(),
      }),
    ];

    await createTracesCh(traces);

    const templateId = randomUUID();

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

    const configId = randomUUID();
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
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: templateId,
      },
    });

    const payload = {
      id: randomUUID(),
      timestamp: new Date(),
      name: QueueJobs.BatchActionProcessingJob as const,
      payload: {
        projectId,
        actionId: "eval-create" as const,
        targetObject: "trace" as const,
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
      const evalExecutions = await prisma.jobExecution.findMany({
        where: {
          projectId,
          jobConfigurationId: configId,
        },
      });
      expect(evalExecutions).toHaveLength(1);
      expect(evalExecutions[0].jobInputTraceId).toBe(traceId1);
      expect(evalExecutions[0].status).toBe("PENDING");
    });
  });
  it.only("should create eval jobs for historic datasets", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId1 = randomUUID();
    const traceId2 = randomUUID();

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

    const datasetName = randomUUID();
    const dataset = await prisma.dataset.create({
      data: {
        id: randomUUID(),
        projectId,
        name: datasetName,
      },
    });

    const datasetItem1 = await prisma.datasetItem.create({
      data: {
        id: randomUUID(),
        datasetId: dataset.id,
        input: "Hello, world!",
        projectId,
      },
    });

    const datasetItem2 = await prisma.datasetItem.create({
      data: {
        id: randomUUID(),
        datasetId: dataset.id,
        input: "Hello, world!",
        projectId,
      },
    });

    const runId = randomUUID();

    const datasetRun = await prisma.datasetRuns.create({
      data: {
        id: runId,
        datasetId: dataset.id,
        projectId,
        name: "test-run",
      },
    });

    const datasetRunItem1 = await prisma.datasetRunItems.create({
      data: {
        id: randomUUID(),
        datasetItemId: datasetItem1.id,
        projectId,
        traceId: traceId1,
        datasetRunId: runId,
      },
    });

    const datasetRunItem2 = await prisma.datasetRunItems.create({
      data: {
        id: randomUUID(),
        datasetItemId: datasetItem2.id,
        projectId,
        traceId: traceId2,
        datasetRunId: runId,
      },
    });

    const templateId = randomUUID();

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

    const configId = randomUUID();
    await prisma.jobConfiguration.create({
      data: {
        id: configId,
        projectId,
        filter: [
          {
            type: "stringOptions" as const,
            value: [datasetName],
            column: "Dataset",
            operator: "any of" as const,
          },
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "dataset",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: templateId,
      },
    });

    const payload = {
      id: randomUUID(),
      timestamp: new Date(),
      name: QueueJobs.BatchActionProcessingJob as const,
      payload: {
        projectId,
        actionId: "eval-create" as const,
        targetObject: "dataset" as const,
        configId,
        cutoffCreatedAt: new Date(),
        query: {
          filter: [
            {
              type: "stringOptions" as const,
              value: [datasetName],
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
      const evalExecutions = await prisma.jobExecution.findMany({
        where: {
          projectId,
          jobConfigurationId: configId,
        },
      });
      expect(evalExecutions).toHaveLength(2);
      const traceIds = [
        evalExecutions[0].jobInputTraceId,
        evalExecutions[1].jobInputTraceId,
      ];
      expect(traceIds).toContain(traceId1);
      expect(traceIds).toContain(traceId2);
      expect(evalExecutions[0].status).toBe("PENDING");
      expect(evalExecutions[1].status).toBe("PENDING");
    }, 10000);
  }, 10000);
});
