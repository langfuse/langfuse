vi.hoisted(() => {
  process.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
});

process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
  "true";
process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION = "true";

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  const queue = {
    add: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    on: vi.fn(),
  };

  return {
    ...actual,
    EventPropagationQueue: {
      getInstance: () => queue,
    },
    EntityChangeQueue: {
      getInstance: () => queue,
    },
    DatasetRunItemUpsertQueue: {
      getInstance: () => queue,
    },
    DatasetDeleteQueue: {
      getInstance: () => queue,
    },
  };
});

import { v4 as uuidv4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createObservation,
  createObservationsCh,
  createDatasetRunItem,
  createDatasetRunItemsCh,
  createTrace,
  createTracesCh,
} from "@langfuse/shared/src/server";
import {
  createMcpTestSetup,
  createPromptInDb,
  mockServerContext,
  verifyAuditLog,
  waitFor,
} from "./mcp-helpers";
import "@/src/features/mcp/server/bootstrap";
import { config as mcpRouteConfig } from "@/src/pages/api/public/mcp";
import { toolRegistry } from "@/src/features/mcp/server/registry";
import {
  handleCreateAnnotationQueue,
  handleCreateAnnotationQueueAssignment,
  handleCreateAnnotationQueueItem,
  handleDeleteAnnotationQueueAssignment,
  handleDeleteAnnotationQueueItem,
  handleGetAnnotationQueue,
  handleGetAnnotationQueueItem,
  handleListAnnotationQueueItems,
  handleListAnnotationQueues,
  handleUpdateAnnotationQueueItem,
} from "@/src/features/mcp/features/annotationQueues/tools";
import {
  handleCreateComment,
  handleGetComment,
  handleListComments,
} from "@/src/features/mcp/features/comments/tools";
import {
  handleCreateDatasetRunItem,
  handleDeleteDatasetItem,
  handleDeleteDatasetRun,
  handleGetDataset,
  handleGetDatasetItem,
  handleGetDatasetRun,
  handleListDatasetItems,
  handleListDatasetRunItems,
  handleListDatasetRuns,
  handleListDatasets,
  handleUpsertDataset,
  handleUpsertDatasetItem,
  upsertDatasetTool,
} from "@/src/features/mcp/features/datasets/tools";
import { handleGetHealth } from "@/src/features/mcp/features/health/tools";
import {
  handleCreateModel,
  handleDeleteModel,
  handleGetModel,
  handleListModels,
} from "@/src/features/mcp/features/models/tools";
import { handleCreateScoreConfig } from "@/src/features/mcp/features/scores/tools/createScoreConfig";
import { handleGetScoreConfig } from "@/src/features/mcp/features/scores/tools/getScoreConfig";
import { handleListScoreConfigs } from "@/src/features/mcp/features/scores/tools/listScoreConfigs";
import { handleUpdateScoreConfig } from "@/src/features/mcp/features/scores/tools/updateScoreConfig";

const createScoreConfig = async (projectId: string) =>
  prisma.scoreConfig.create({
    data: {
      id: uuidv4(),
      projectId,
      name: `mcp-score-${uuidv4().slice(0, 8)}`,
      dataType: "NUMERIC",
    },
  });

const createProjectUser = async ({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId: string;
}) => {
  const user = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: `mcp-user-${uuidv4()}@example.com`,
      name: "MCP Test User",
    },
  });

  const orgMembership = await prisma.organizationMembership.create({
    data: {
      orgId,
      userId: user.id,
      role: "MEMBER",
    },
  });

  await prisma.projectMembership.create({
    data: {
      projectId,
      userId: user.id,
      role: "MEMBER",
      orgMembershipId: orgMembership.id,
    },
  });

  return user;
};

describe("MCP public API tools", () => {
  const getToolNames = async (context = mockServerContext()) =>
    (await toolRegistry.getToolDefinitions(context)).map((tool) => tool.name);

  it("registers public API tools", async () => {
    const toolNames = await getToolNames();

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "listAnnotationQueues",
        "createAnnotationQueue",
        "createComment",
        "listEvaluators",
        "getEvaluator",
        "upsertEvaluator",
        "listEvaluationRules",
        "getEvaluationRule",
        "createEvaluationRule",
        "createDashboardWidget",
        "listDatasets",
        "getHealth",
        "listScores",
        "getScore",
        "listMonitors",
        "getMonitor",
        "createModel",
        "createScoreConfig",
      ]),
    );
  });

  it("exposes the same feature-enabled tools for in-app agent keys", async () => {
    const toolNames = await getToolNames();
    const inAppToolNames = await getToolNames(
      mockServerContext({ inAppAgent: { permissions: "read" } }),
    );

    expect(inAppToolNames.sort()).toEqual(toolNames.sort());
  });

  it("does not resolve mutating tools for in-app agent keys without a run override", async () => {
    const context = mockServerContext({
      inAppAgent: { permissions: "read" },
    });
    const inAppToolNames = await getToolNames(context);

    expect(inAppToolNames).toEqual(
      expect.arrayContaining(["upsertDataset", "createModel"]),
    );

    await expect(
      toolRegistry.getEnabledTool("upsertDataset", context),
    ).resolves.toBeUndefined();
    await expect(
      toolRegistry.getEnabledTool("createModel", context),
    ).resolves.toBeUndefined();
    await expect(
      toolRegistry.getEnabledTool("createDashboardWidget", context),
    ).resolves.toBeUndefined();
  });

  it("resolves only the overridden mutating tool for in-app agent keys", async () => {
    const context = mockServerContext({
      inAppAgent: {
        permissions: "single-tool-override",
        allowedToolName: "upsertDataset",
      },
    });

    await expect(
      toolRegistry.getEnabledTool("upsertDataset", context),
    ).resolves.toBeTruthy();
    await expect(
      toolRegistry.getEnabledTool("createModel", context),
    ).resolves.toBeUndefined();
    await expect(
      toolRegistry.getEnabledTool("listDatasets", context),
    ).resolves.toBeUndefined();
  });

  it("resolves the dashboard widget creation override for in-app agent keys", async () => {
    const context = mockServerContext({
      inAppAgent: {
        permissions: "single-tool-override",
        allowedToolName: "createDashboardWidget",
      },
    });

    await expect(
      toolRegistry.getEnabledTool("createDashboardWidget", context),
    ).resolves.toBeTruthy();
    await expect(
      toolRegistry.getEnabledTool("upsertDataset", context),
    ).resolves.toBeUndefined();
  });

  it("marks destructive public API tools", async () => {
    const toolNames = await getToolNames();

    const destructiveToolNames = toolNames
      .filter(
        (toolName) =>
          toolRegistry.getTool(toolName)?.definition.annotations
            ?.destructiveHint,
      )
      .sort();
    expect(destructiveToolNames).toEqual(
      [
        "addDashboardPlacement",
        "createChatPrompt",
        "createDashboard",
        "createDashboardWidget",
        "createEvaluationRule",
        "upsertEvaluator",
        "createScore",
        "createScoreConfig",
        "createTextPrompt",
        "deleteAnnotationQueueAssignment",
        "deleteAnnotationQueueItem",
        "deleteDashboard",
        "deleteDashboardPlacement",
        "deleteDashboardWidget",
        "deleteDatasetItem",
        "deleteDatasetRun",
        "deleteEvaluationRule",
        "deleteEvaluator",
        "deleteModel",
        "deleteScoreConfig",
        "updateAnnotationQueueItem",
        "updateDashboard",
        "updateDashboardPlacement",
        "updateDashboardWidget",
        "updateEvaluationRule",
        "updatePromptLabels",
        "updateScoreConfig",
        "upsertDataset",
        "upsertDatasetItem",
      ].sort(),
    );
  });

  it("uses a larger MCP request body limit", () => {
    expect(mcpRouteConfig.api.bodyParser.sizeLimit).toBe("4.5mb");
  });

  it("covers annotation queue public API routes", async () => {
    const { context, projectId, orgId } = await createMcpTestSetup();
    const scoreConfig = await createScoreConfig(projectId);
    const user = await createProjectUser({ orgId, projectId });

    const queue = (await handleCreateAnnotationQueue(
      {
        name: `mcp-queue-${uuidv4()}`,
        description: "MCP queue",
        scoreConfigIds: [scoreConfig.id],
      },
      context,
    )) as { id: string; name: string };

    const queues = (await handleListAnnotationQueues(
      { page: 1, limit: 10 },
      context,
    )) as { data: Array<{ id: string }> };
    expect(queues.data.map((item) => item.id)).toContain(queue.id);

    await expect(
      handleGetAnnotationQueue({ queueId: queue.id }, context),
    ).resolves.toMatchObject({ id: queue.id, name: queue.name });

    const queueItem = (await handleCreateAnnotationQueueItem(
      {
        queueId: queue.id,
        objectId: uuidv4(),
        objectType: "TRACE",
      } as unknown as Parameters<typeof handleCreateAnnotationQueueItem>[0],
      context,
    )) as { id: string; status: string };
    expect(queueItem.status).toBe("PENDING");

    const queueItems = (await handleListAnnotationQueueItems(
      { queueId: queue.id, page: 1, limit: 10 },
      context,
    )) as { data: Array<{ id: string }> };
    expect(queueItems.data.map((item) => item.id)).toContain(queueItem.id);

    await expect(
      handleGetAnnotationQueueItem(
        { queueId: queue.id, itemId: queueItem.id },
        context,
      ),
    ).resolves.toMatchObject({ id: queueItem.id, queueId: queue.id });

    await expect(
      handleUpdateAnnotationQueueItem(
        { queueId: queue.id, itemId: queueItem.id, status: "COMPLETED" },
        context,
      ),
    ).resolves.toMatchObject({ id: queueItem.id, status: "COMPLETED" });

    await expect(
      handleCreateAnnotationQueueAssignment(
        { queueId: queue.id, userId: user.id },
        context,
      ),
    ).resolves.toMatchObject({
      queueId: queue.id,
      userId: user.id,
      projectId,
    });

    const assignment = await prisma.annotationQueueAssignment.findUniqueOrThrow(
      {
        where: {
          projectId_queueId_userId: {
            projectId,
            queueId: queue.id,
            userId: user.id,
          },
        },
      },
    );
    const assignmentAuditLogCount = await prisma.auditLog.count({
      where: {
        resourceType: "annotationQueueAssignment",
        resourceId: assignment.id,
        action: "create",
      },
    });

    await expect(
      handleCreateAnnotationQueueAssignment(
        { queueId: queue.id, userId: user.id },
        context,
      ),
    ).resolves.toMatchObject({
      queueId: queue.id,
      userId: user.id,
      projectId,
    });

    // Assignment creation uses an upsert for public API parity, so duplicate
    // calls are audited even when the assignment already exists.
    await expect(
      prisma.auditLog.count({
        where: {
          resourceType: "annotationQueueAssignment",
          resourceId: assignment.id,
          action: "create",
        },
      }),
    ).resolves.toBe(assignmentAuditLogCount + 1);

    const auditLogCreateSpy = vi
      .spyOn(prisma, "$transaction")
      .mockRejectedValueOnce(new Error("audit failed"));

    try {
      await expect(
        handleDeleteAnnotationQueueAssignment(
          { queueId: queue.id, userId: user.id },
          context,
        ),
      ).rejects.toThrow("An unexpected error occurred");
    } finally {
      auditLogCreateSpy.mockRestore();
    }

    await handleCreateAnnotationQueueAssignment(
      { queueId: queue.id, userId: user.id },
      context,
    );

    await expect(
      handleDeleteAnnotationQueueAssignment(
        { queueId: queue.id, userId: user.id },
        context,
      ),
    ).resolves.toEqual({ success: true });

    await expect(
      handleDeleteAnnotationQueueAssignment(
        { queueId: queue.id, userId: user.id },
        context,
      ),
    ).rejects.toThrow("Annotation queue assignment not found");

    await expect(
      handleDeleteAnnotationQueueItem(
        { queueId: queue.id, itemId: queueItem.id },
        context,
      ),
    ).resolves.toEqual({
      success: true,
      message: "Annotation queue item deleted successfully",
    });
  });

  it("covers comment and model public API routes", async () => {
    const { context, projectId } = await createMcpTestSetup();
    const prompt = await createPromptInDb({
      projectId,
      name: `mcp-comment-prompt-${uuidv4()}`,
      prompt: "Test prompt",
    });

    const created = (await handleCreateComment(
      {
        objectType: "PROMPT",
        objectId: prompt.id,
        content: "MCP comment",
      },
      context,
    )) as { id: string };

    const listed = (await handleListComments(
      {
        objectType: "PROMPT",
        objectId: prompt.id,
        page: 1,
        limit: 10,
      },
      context,
    )) as { data: Array<{ id: string; content: string }> };
    expect(listed.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.id, content: "MCP comment" }),
      ]),
    );

    await expect(
      handleGetComment({ commentId: created.id }, context),
    ).resolves.toMatchObject({ id: created.id, objectId: prompt.id });

    const modelName = `0000-mcp-model-${uuidv4()}`;
    const model = (await handleCreateModel(
      {
        modelName,
        matchPattern: `(?i)^${modelName}$`,
        unit: "TOKENS",
        inputPrice: 0.001,
        outputPrice: 0.002,
      },
      context,
    )) as { id: string; modelName: string };
    expect(model.modelName).toBe(modelName);

    const models = (await handleListModels(
      { page: 1, limit: 100 },
      context,
    )) as { data: Array<{ id: string }> };
    expect(models.data.map((item) => item.id)).toContain(model.id);

    await expect(
      handleGetModel({ modelId: model.id }, context),
    ).resolves.toMatchObject({ id: model.id, modelName });

    await expect(
      handleDeleteModel({ modelId: model.id }, context),
    ).resolves.toEqual({ message: "Model successfully deleted" });
  });

  it("covers dataset, dataset item, run item, and run public API routes", async () => {
    const { context, projectId, apiKeyId } = await createMcpTestSetup();
    const datasetName = `mcp-dataset-100% accuracy %20 ${uuidv4()}`;
    const traceId = uuidv4();
    const observationId = uuidv4();

    await createTracesCh([
      createTrace({
        id: traceId,
        name: "mcp-dataset-trace",
        user_id: "mcp-user",
        project_id: projectId,
      }),
    ]);
    await createObservationsCh([
      createObservation({
        id: observationId,
        trace_id: traceId,
        project_id: projectId,
        type: "GENERATION",
        name: "mcp-dataset-generation",
        start_time: new Date("2026-01-01T00:00:00.000Z").getTime(),
        end_time: new Date("2026-01-01T00:00:01.000Z").getTime(),
      }),
    ]);

    const datasetInputSchema = {
      type: "object",
      properties: { question: { type: "string" } },
      required: ["question"],
      additionalProperties: false,
    };
    const datasetExpectedOutputSchema = {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"],
      additionalProperties: false,
    };
    const upsertDataset = await toolRegistry.getEnabledTool(
      upsertDatasetTool.name,
      context,
    );
    expect(upsertDataset).toBeDefined();

    const dataset = (await upsertDataset?.handler(
      {
        name: datasetName,
        description: "MCP dataset",
        metadata: { source: "mcp" },
        inputSchema: datasetInputSchema,
        expectedOutputSchema: datasetExpectedOutputSchema,
      },
      context,
    )) as {
      id: string;
      name: string;
      inputSchema: unknown;
      expectedOutputSchema: unknown;
    };
    expect(dataset.name).toBe(datasetName);
    expect(dataset.inputSchema).toEqual(datasetInputSchema);
    expect(dataset.expectedOutputSchema).toEqual(datasetExpectedOutputSchema);

    await expect(
      upsertDataset?.handler(
        {
          name: datasetName,
          inputSchema: JSON.stringify(datasetInputSchema),
          expectedOutputSchema: JSON.stringify(datasetExpectedOutputSchema),
        },
        context,
      ),
    ).resolves.toMatchObject({
      id: dataset.id,
      inputSchema: datasetInputSchema,
      expectedOutputSchema: datasetExpectedOutputSchema,
    });

    const renamedDatasetName = `mcp-dataset-renamed-${uuidv4()}`;
    const renamedDataset = (await handleUpsertDataset(
      {
        id: dataset.id,
        name: renamedDatasetName,
        description: "Renamed MCP dataset",
      },
      context,
    )) as { id: string; name: string; description: string };
    expect(renamedDataset).toMatchObject({
      id: dataset.id,
      name: renamedDatasetName,
      description: "Renamed MCP dataset",
    });

    await expect(
      handleUpsertDataset(
        {
          id: "",
          name: `mcp-dataset-empty-id-${uuidv4()}`,
        },
        context,
      ),
    ).rejects.toThrow("Validation failed");

    const conflictingDatasetName = `mcp-dataset-conflict-${uuidv4()}`;
    await handleUpsertDataset({ name: conflictingDatasetName }, context);
    await expect(
      handleUpsertDataset(
        {
          id: dataset.id,
          name: conflictingDatasetName,
        },
        context,
      ),
    ).rejects.toThrow("Dataset name already in use");

    const datasets = (await handleListDatasets(
      { page: 1, limit: 10 },
      context,
    )) as { data: Array<{ id: string }> };
    expect(datasets.data.map((item) => item.id)).toContain(dataset.id);

    await expect(
      handleGetDataset({ datasetId: dataset.id }, context),
    ).resolves.toMatchObject({ id: dataset.id, name: renamedDatasetName });

    const datasetItem = (await handleUpsertDatasetItem(
      {
        datasetId: dataset.id,
        input: { question: "ping" },
        expectedOutput: { answer: "pong" },
      },
      context,
    )) as { id: string; datasetName: string };
    expect(datasetItem.datasetName).toBe(renamedDatasetName);

    const datasetItems = (await handleListDatasetItems(
      { datasetId: dataset.id, page: 1, limit: 10 },
      context,
    )) as { data: Array<{ id: string }> };
    expect(datasetItems.data.map((item) => item.id)).toContain(datasetItem.id);

    await expect(
      handleGetDatasetItem({ datasetItemId: datasetItem.id }, context),
    ).resolves.toMatchObject({
      id: datasetItem.id,
      datasetName: renamedDatasetName,
    });

    const runName = `mcp-run-50% accuracy %20 ${uuidv4()}`;
    const runItem = (await handleCreateDatasetRunItem(
      {
        datasetItemId: datasetItem.id,
        traceId,
        observationId,
        runName,
        runDescription: "MCP run",
        metadata: { source: "mcp" },
      },
      context,
    )) as { id: string; datasetRunId: string; datasetItemId: string };
    expect(runItem.datasetItemId).toBe(datasetItem.id);
    await expect(
      verifyAuditLog({
        projectId,
        apiKeyId,
        resourceType: "datasetRunItem",
        resourceId: runItem.id,
        action: "create",
      }),
    ).resolves.toMatchObject({
      resourceType: "datasetRunItem",
      resourceId: runItem.id,
      action: "create",
    });

    await createDatasetRunItemsCh([
      createDatasetRunItem({
        id: runItem.id,
        project_id: projectId,
        trace_id: traceId,
        observation_id: observationId,
        dataset_run_id: runItem.datasetRunId,
        dataset_item_id: datasetItem.id,
        dataset_id: dataset.id,
        dataset_run_name: runName,
      }),
    ]);

    await waitFor(async () => {
      const runItems = (await handleListDatasetRunItems(
        {
          datasetId: dataset.id,
          datasetRunId: runItem.datasetRunId,
          page: 1,
          limit: 10,
        },
        context,
      )) as { data: Array<{ id: string }> };

      return runItems.data.some((item) => item.id === runItem.id);
    });

    const datasetRuns = (await handleListDatasetRuns(
      { datasetId: dataset.id, page: 1, limit: 10 },
      context,
    )) as { data: Array<{ id: string; name: string }> };
    expect(datasetRuns.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: runItem.datasetRunId, name: runName }),
      ]),
    );

    await expect(
      handleGetDatasetRun(
        { datasetId: dataset.id, datasetRunId: runItem.datasetRunId },
        context,
      ),
    ).resolves.toMatchObject({
      id: runItem.datasetRunId,
      name: runName,
      datasetRunItems: expect.arrayContaining([
        expect.objectContaining({ id: runItem.id }),
      ]),
    });

    await expect(
      handleDeleteDatasetRun(
        { datasetId: dataset.id, datasetRunId: runItem.datasetRunId },
        context,
      ),
    ).resolves.toEqual({ message: "Dataset run successfully deleted" });

    await expect(
      handleDeleteDatasetItem({ datasetItemId: datasetItem.id }, context),
    ).resolves.toEqual({ message: "Dataset item successfully deleted" });
  });

  it("covers health public API route and cross-project recent-event checks", async () => {
    const { context } = await createMcpTestSetup();

    await expect(
      handleGetHealth(
        {} as unknown as Parameters<typeof handleGetHealth>[0],
        context,
      ),
    ).resolves.toMatchObject({
      status: "OK",
      version: expect.any(String),
    });

    const { projectId: otherProjectId } = await createMcpTestSetup();
    const traceId = uuidv4();

    await createTracesCh([
      createTrace({
        id: traceId,
        project_id: otherProjectId,
      }),
    ]);
    await createObservationsCh([
      createObservation({
        id: uuidv4(),
        trace_id: traceId,
        project_id: otherProjectId,
      }),
    ]);

    await expect(
      handleGetHealth(
        { failIfNoRecentEvents: true } as unknown as Parameters<
          typeof handleGetHealth
        >[0],
        context,
      ),
    ).resolves.toMatchObject({
      status: "OK",
      version: expect.any(String),
    });
  });

  it("rejects cross-project access to project-scoped MCP resources", async () => {
    const { context: sourceContext, projectId: sourceProjectId } =
      await createMcpTestSetup();
    const { context: targetContext } = await createMcpTestSetup();

    const scoreConfig = await createScoreConfig(sourceProjectId);
    const queue = (await handleCreateAnnotationQueue(
      {
        name: `mcp-queue-isolation-${uuidv4()}`,
        scoreConfigIds: [scoreConfig.id],
      },
      sourceContext,
    )) as { id: string };

    await expect(
      handleGetAnnotationQueue({ queueId: queue.id }, targetContext),
    ).rejects.toThrow("Annotation queue not found");

    const datasetName = `mcp-dataset-isolation-${uuidv4()}`;
    const dataset = (await handleUpsertDataset(
      { name: datasetName },
      sourceContext,
    )) as { id: string };

    await expect(
      handleGetDataset({ datasetId: dataset.id }, targetContext),
    ).rejects.toThrow("Dataset not found");
    await expect(
      handleListDatasetItems(
        { datasetId: dataset.id, page: 1, limit: 10 },
        targetContext,
      ),
    ).rejects.toThrow("Dataset not found");
    await expect(
      handleListDatasetRunItems(
        { datasetId: dataset.id, datasetRunId: uuidv4(), page: 1, limit: 10 },
        targetContext,
      ),
    ).rejects.toThrow("Dataset run not found");

    const prompt = await createPromptInDb({
      projectId: sourceProjectId,
      name: `mcp-comment-isolation-${uuidv4()}`,
      prompt: "Test prompt",
    });
    const comment = (await handleCreateComment(
      {
        objectType: "PROMPT",
        objectId: prompt.id,
        content: "MCP isolated comment",
      },
      sourceContext,
    )) as { id: string };

    await expect(
      handleGetComment({ commentId: comment.id }, targetContext),
    ).rejects.toThrow("Comment not found within authorized project");

    const modelName = `mcp-model-isolation-${uuidv4()}`;
    const model = (await handleCreateModel(
      {
        modelName,
        matchPattern: `(?i)^${modelName}$`,
        unit: "TOKENS",
        inputPrice: 0.001,
        outputPrice: 0.002,
      },
      sourceContext,
    )) as { id: string };

    await expect(
      handleGetModel({ modelId: model.id }, targetContext),
    ).rejects.toThrow("No model with this id found");

    await expect(
      handleGetScoreConfig({ configId: scoreConfig.id }, targetContext),
    ).rejects.toThrow("Score config not found within authorized project");
    await expect(
      handleUpdateScoreConfig(
        { configId: scoreConfig.id, description: "cross-project update" },
        targetContext,
      ),
    ).rejects.toThrow("Score config not found within authorized project");
  });

  it("covers score config public API routes", async () => {
    const { context } = await createMcpTestSetup();
    const scoreConfigName = `mcp-score-${uuidv4().slice(0, 8)}`;

    const scoreConfig = (await handleCreateScoreConfig(
      {
        name: scoreConfigName,
        dataType: "NUMERIC",
        numericMinValue: 0,
        numericMaxValue: 1,
      } as unknown as Parameters<typeof handleCreateScoreConfig>[0],
      context,
    )) as { id: string; name: string };
    expect(scoreConfig.name).toBe(scoreConfigName);

    const scoreConfigs = (await handleListScoreConfigs(
      { page: 1, limit: 10 },
      context,
    )) as { data: Array<{ id: string }> };
    expect(scoreConfigs.data.map((item) => item.id)).toContain(scoreConfig.id);

    await expect(
      handleGetScoreConfig({ configId: scoreConfig.id }, context),
    ).resolves.toMatchObject({ id: scoreConfig.id, name: scoreConfigName });

    await expect(
      handleUpdateScoreConfig({ configId: scoreConfig.id }, context),
    ).rejects.toThrow("Request body cannot be empty");

    await expect(
      handleUpdateScoreConfig(
        {
          configId: scoreConfig.id,
          description: "Updated through MCP",
        },
        context,
      ),
    ).resolves.toMatchObject({
      id: scoreConfig.id,
      description: "Updated through MCP",
    });
  });
});

describe("MCP tool schema interoperability", () => {
  /** Recursively collect all JSON Schema `pattern` values with their location. */
  const collectPatterns = (
    schema: unknown,
    path: string[] = [],
  ): { path: string; pattern: string }[] => {
    if (typeof schema !== "object" || schema === null) return [];

    if (Array.isArray(schema)) {
      return schema.flatMap((item, index) =>
        collectPatterns(item, [...path, String(index)]),
      );
    }

    const obj = schema as Record<string, unknown>;
    const ownPattern =
      typeof obj.pattern === "string"
        ? [{ path: path.join("."), pattern: obj.pattern }]
        : [];

    return [
      ...ownPattern,
      ...Object.entries(obj).flatMap(([key, value]) =>
        collectPatterns(value, [...path, key]),
      ),
    ];
  };

  const getAllToolPatterns = () =>
    toolRegistry.getFeatures().flatMap((feature) =>
      feature.tools.flatMap((tool) =>
        collectPatterns(tool.definition.inputSchema).map((entry) => ({
          tool: tool.definition.name,
          ...entry,
        })),
      ),
    );

  it("advertises no pattern that requires the ECMAScript `u` flag", () => {
    // JSON Schema `pattern` is an ECMA-262 regex compiled WITHOUT the `u` flag.
    // Unicode-only escapes (`\p{...}`, `\P{...}`, `\u{...}`) don't merely fail
    // OpenAI/Vertex validation — without `u` they silently degrade instead of
    // throwing: e.g. `^[\p{L}\p{N}_ .()-]+$` collapses to a literal class
    // `[pLN{}...]` that REJECTS valid ASCII like "quality". Because those
    // providers validate the whole tool catalog atomically, a single such
    // pattern disables every Langfuse MCP tool.
    const offending = getAllToolPatterns().filter(({ pattern }) =>
      /\\[pP]\{|\\u\{/.test(pattern),
    );

    expect(offending).toEqual([]);
  });
});
