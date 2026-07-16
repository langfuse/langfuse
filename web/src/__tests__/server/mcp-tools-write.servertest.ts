// Mock queue operations to avoid Redis dependency in tests
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    // Mock queue getInstance to return a no-op queue
    EventPropagationQueue: {
      getInstance: () => ({
        add: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
      }),
    },
    EntityChangeQueue: {
      getInstance: () => ({
        add: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
      }),
    },
  };
});

// Code evaluators are gated behind deployment config; enable them for the
// code-path coverage below without depending on a real dispatcher.
vi.mock(
  "@/src/features/evals/server/isCodeEvalEnabled",
  async (importActual) => ({
    ...(await importActual<object>()),
    isCodeEvalEnabled: vi.fn(() => true),
    isCodeEvalSourceCodeLanguageSupported: vi.fn(() => true),
  }),
);

// Skip the LLM model preflight so llm_as_judge evaluators don't require a
// provisioned default eval model.
vi.mock(
  "@/src/features/evals/server/evaluator-preflight",
  async (importActual) => ({
    ...(await importActual<object>()),
    getEvaluatorDefinitionPreflightError: vi.fn(async () => null),
  }),
);

import { prisma } from "@langfuse/shared/src/db";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createMcpTestSetup,
  createPromptInDb,
  mcpEvalOutputDefinition,
  verifyAuditLog,
  verifyToolAnnotations,
} from "./mcp-helpers";
import {
  DeleteDatasetRunMcpInput,
  PostDatasetItemMcpInput,
} from "@/src/features/mcp/features/datasets/schema";

// Import MCP tool handlers directly
import { handleCreateTextPrompt } from "@/src/features/mcp/features/prompts/tools/createTextPrompt";
import { handleCreateChatPrompt } from "@/src/features/mcp/features/prompts/tools/createChatPrompt";
import { handleUpdatePromptLabels } from "@/src/features/mcp/features/prompts/tools/updatePromptLabels";
import { handleCreateAnnotationQueue } from "@/src/features/mcp/features/annotationQueues/tools";
import {
  upsertEvaluatorTool,
  handleUpsertEvaluator,
} from "@/src/features/mcp/features/evals/tools/upsertEvaluator";
import {
  createEvaluationRuleTool,
  handleCreateEvaluationRule,
} from "@/src/features/mcp/features/evals/tools/createEvaluationRule";
import {
  updateEvaluationRuleTool,
  handleUpdateEvaluationRule,
} from "@/src/features/mcp/features/evals/tools/updateEvaluationRule";
import {
  deleteEvaluationRuleTool,
  handleDeleteEvaluationRule,
} from "@/src/features/mcp/features/evals/tools/deleteEvaluationRule";
import {
  deleteEvaluatorTool,
  handleDeleteEvaluator,
} from "@/src/features/mcp/features/evals/tools/deleteEvaluator";
import { handleGetEvaluationRule } from "@/src/features/mcp/features/evals/tools/getEvaluationRule";
import {
  createDashboardWidgetTool,
  handleCreateDashboardWidget,
} from "@/src/features/mcp/features/dashboardWidgets/tools/createDashboardWidget";
import {
  handleAddDashboardPlacement,
  handleCreateDashboard,
  handleDeleteDashboard,
  handleDeleteDashboardPlacement,
  handleDeleteDashboardWidget,
  handleGetDashboard,
  handleGetDashboardWidget,
  handleUpdateDashboardPlacement,
  handleUpdateDashboard,
  handleUpdateDashboardWidget,
} from "@/src/features/mcp/features/dashboardWidgets/tools/dashboardCrud";

const createScoreConfig = async (projectId: string) =>
  prisma.scoreConfig.create({
    data: {
      id: nanoid(),
      projectId,
      name: `mcp-score-${nanoid()}`,
      dataType: "NUMERIC",
    },
  });

const createLlmEvaluatorForMcpWriteTest = async (
  setup: Awaited<ReturnType<typeof createMcpTestSetup>>,
  name = `mcp-eval-${nanoid()}`,
) => {
  return (await handleUpsertEvaluator(
    {
      name,
      type: "llm_as_judge",
      prompt: "Judge {{input}} against {{output}}",
      outputDefinition: mcpEvalOutputDefinition,
      modelConfig: null,
    },
    setup.context,
  )) as { id: string; name: string; type: string; variables: string[] };
};

const createLlmEvaluationRuleForMcpWriteTest = async (
  setup: Awaited<ReturnType<typeof createMcpTestSetup>>,
) => {
  const evaluatorName = `mcp-eval-${nanoid()}`;
  const evaluator = await createLlmEvaluatorForMcpWriteTest(
    setup,
    evaluatorName,
  );
  const ruleName = `mcp-rule-${nanoid()}`;
  const rule = (await handleCreateEvaluationRule(
    {
      name: ruleName,
      evaluator: {
        name: evaluatorName,
        scope: "project",
        type: "llm_as_judge",
      },
      enabled: false,
      sampling: 1,
      target: "observation",
      filter: [
        { column: "version", operator: "=", value: "1.0.0", type: "string" },
      ],
      mapping: [
        { variable: "input", source: "input" },
        { variable: "output", source: "output" },
      ],
    },
    setup.context,
  )) as { id: string; name: string; target: string; sampling: number };

  return { evaluator, rule };
};

describe("MCP Write Tools", () => {
  describe("dataset tool schemas", () => {
    it("uses dataset IDs for existing dataset write addressing", () => {
      for (const schema of [
        PostDatasetItemMcpInput,
        DeleteDatasetRunMcpInput,
      ]) {
        const jsonSchema = z.toJSONSchema(schema, { unrepresentable: "any" });
        const properties = jsonSchema.properties as Record<string, unknown>;

        expect(properties).toHaveProperty("datasetId");
        expect(properties).not.toHaveProperty("datasetName");
        expect(properties).not.toHaveProperty("name");
      }
    });
  });

  describe("upsertEvaluator tool", () => {
    it("should have destructiveHint annotation", () => {
      verifyToolAnnotations(upsertEvaluatorTool, { destructiveHint: true });
    });

    it("should create an llm-as-judge evaluator and audit the write", async () => {
      const setup = await createMcpTestSetup();
      const { projectId, apiKeyId } = setup;
      const evaluatorName = `mcp-eval-${nanoid()}`;

      const evaluator = await createLlmEvaluatorForMcpWriteTest(
        setup,
        evaluatorName,
      );

      expect(evaluator).toMatchObject({
        name: evaluatorName,
        type: "llm_as_judge",
      });
      expect(evaluator.variables.sort()).toEqual(["input", "output"]);
      await expect(
        verifyAuditLog({
          projectId,
          apiKeyId,
          resourceType: "evalTemplate",
          resourceId: evaluator.id,
          action: "create",
        }),
      ).resolves.toMatchObject({ resourceId: evaluator.id, action: "create" });
    });

    it("should create code evaluators", async () => {
      const { context, projectId, apiKeyId } = await createMcpTestSetup();

      const evaluator = (await handleUpsertEvaluator(
        {
          name: `mcp-code-eval-${nanoid()}`,
          type: "code",
          sourceCode: "export function evaluate() { return { score: 1 }; }",
          sourceCodeLanguage: "TYPESCRIPT",
        },
        context,
      )) as { id: string; type: string; sourceCodeLanguage: string };

      expect(evaluator).toMatchObject({
        type: "code",
        sourceCodeLanguage: "TYPESCRIPT",
      });
      await expect(
        verifyAuditLog({
          projectId,
          apiKeyId,
          resourceType: "evalTemplate",
          resourceId: evaluator.id,
          action: "create",
        }),
      ).resolves.toMatchObject({ resourceId: evaluator.id, action: "create" });
    });
  });

  describe("createEvaluationRule tool", () => {
    it("should have destructiveHint annotation", () => {
      verifyToolAnnotations(createEvaluationRuleTool, {
        destructiveHint: true,
      });
    });

    it("should create an evaluation rule and audit the write", async () => {
      const setup = await createMcpTestSetup();
      const { projectId, apiKeyId } = setup;

      const { rule } = await createLlmEvaluationRuleForMcpWriteTest(setup);

      expect(rule).toMatchObject({ target: "observation", sampling: 1 });
      await expect(
        verifyAuditLog({
          projectId,
          apiKeyId,
          resourceType: "job",
          resourceId: rule.id,
          action: "create",
        }),
      ).resolves.toMatchObject({ resourceId: rule.id, action: "create" });
    });

    it("should create a code evaluation rule without mapping", async () => {
      const { context } = await createMcpTestSetup();
      const evaluatorName = `mcp-code-eval-${nanoid()}`;

      await handleUpsertEvaluator(
        {
          name: evaluatorName,
          type: "code",
          sourceCode: "export function evaluate() { return { score: 1 }; }",
          sourceCodeLanguage: "TYPESCRIPT",
        },
        context,
      );

      const rule = (await handleCreateEvaluationRule(
        {
          name: `mcp-code-rule-${nanoid()}`,
          evaluator: { name: evaluatorName, scope: "project", type: "code" },
          enabled: false,
          target: "observation",
          filter: [],
        } as unknown as Parameters<typeof handleCreateEvaluationRule>[0],
        context,
      )) as { id: string };
      expect(rule.id).toBeDefined();
    });
  });

  describe("updateEvaluationRule tool", () => {
    it("should have destructiveHint annotation", () => {
      verifyToolAnnotations(updateEvaluationRuleTool, {
        destructiveHint: true,
      });
    });

    it("should update an evaluation rule and audit the write", async () => {
      const setup = await createMcpTestSetup();
      const { projectId, apiKeyId } = setup;
      const { rule } = await createLlmEvaluationRuleForMcpWriteTest(setup);

      await expect(
        handleUpdateEvaluationRule(
          { evaluationRuleId: rule.id, sampling: 0.5 },
          setup.context,
        ),
      ).resolves.toMatchObject({ id: rule.id, sampling: 0.5 });
      await expect(
        verifyAuditLog({
          projectId,
          apiKeyId,
          resourceType: "job",
          resourceId: rule.id,
          action: "update",
        }),
      ).resolves.toMatchObject({ resourceId: rule.id, action: "update" });
    });
  });

  describe("deleteEvaluationRule tool", () => {
    it("should have destructiveHint annotation", () => {
      verifyToolAnnotations(deleteEvaluationRuleTool, {
        destructiveHint: true,
      });
    });

    it("should delete an evaluation rule and audit the write", async () => {
      const setup = await createMcpTestSetup();
      const { projectId, apiKeyId } = setup;
      const { rule } = await createLlmEvaluationRuleForMcpWriteTest(setup);

      await expect(
        handleDeleteEvaluationRule(
          { evaluationRuleId: rule.id },
          setup.context,
        ),
      ).resolves.toEqual({ message: "Evaluation rule successfully deleted" });
      await expect(
        verifyAuditLog({
          projectId,
          apiKeyId,
          resourceType: "job",
          resourceId: rule.id,
          action: "delete",
        }),
      ).resolves.toMatchObject({ resourceId: rule.id, action: "delete" });

      await expect(
        handleGetEvaluationRule({ evaluationRuleId: rule.id }, setup.context),
      ).rejects.toThrow();
    });
  });

  describe("deleteEvaluator tool", () => {
    it("should have destructiveHint annotation", () => {
      verifyToolAnnotations(deleteEvaluatorTool, {
        destructiveHint: true,
      });
    });

    it("should delete an evaluator and audit the write", async () => {
      const setup = await createMcpTestSetup();
      const { projectId, apiKeyId } = setup;
      const evaluator = await createLlmEvaluatorForMcpWriteTest(setup);

      await expect(
        handleDeleteEvaluator({ evaluatorId: evaluator.id }, setup.context),
      ).resolves.toEqual({ message: "Evaluator successfully deleted" });
      await expect(
        verifyAuditLog({
          projectId,
          apiKeyId,
          resourceType: "evalTemplate",
          resourceId: evaluator.id,
          action: "delete",
        }),
      ).resolves.toMatchObject({ resourceId: evaluator.id, action: "delete" });

      await expect(
        prisma.evalTemplate.findUnique({ where: { id: evaluator.id } }),
      ).resolves.toBeNull();
    });

    it("should reject deletion while an evaluation rule references the evaluator", async () => {
      const setup = await createMcpTestSetup();
      const { evaluator } = await createLlmEvaluationRuleForMcpWriteTest(setup);

      await expect(
        handleDeleteEvaluator({ evaluatorId: evaluator.id }, setup.context),
      ).rejects.toThrow(/evaluation rule/);

      await expect(
        prisma.evalTemplate.findUnique({ where: { id: evaluator.id } }),
      ).resolves.not.toBeNull();
    });
  });

  describe("createAnnotationQueue tool", () => {
    it("should create a basic annotation queue", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const scoreConfig = await createScoreConfig(projectId);
      const queueName = `mcp-queue-${nanoid()}`;

      const result = (await handleCreateAnnotationQueue(
        {
          name: queueName,
          description: "MCP queue",
          scoreConfigIds: [scoreConfig.id],
        },
        context,
      )) as {
        id: string;
        name: string;
        description: string;
        scoreConfigIds: string[];
      };

      expect(result.id).toBeDefined();
      expect(result.name).toBe(queueName);
      expect(result.description).toBe("MCP queue");
      expect(result.scoreConfigIds).toEqual([scoreConfig.id]);

      await expect(
        prisma.annotationQueue.findUniqueOrThrow({
          where: { id: result.id, projectId },
        }),
      ).resolves.toMatchObject({
        name: queueName,
        scoreConfigIds: [scoreConfig.id],
      });
    });
  });

  describe("createDashboardWidget tool", () => {
    it("should have destructiveHint annotation", () => {
      verifyToolAnnotations(createDashboardWidgetTool, {
        destructiveHint: true,
      });
    });

    it("should create a dashboard widget and audit the write", async () => {
      const setup = await createMcpTestSetup();
      const { projectId, apiKeyId } = setup;

      const result = (await handleCreateDashboardWidget(
        {
          name: `mcp-widget-${nanoid()}`,
          description: "Created by MCP",
          view: "observations",
          dimensions: [],
          metrics: [{ measure: "count", agg: "count" }],
          filters: [],
          chartType: "NUMBER",
          chartConfig: { type: "NUMBER" },
        },
        setup.context,
      )) as { id: string; name: string; url: string };

      expect(result).toMatchObject({
        id: expect.any(String),
        name: expect.stringContaining("mcp-widget-"),
        url: expect.stringContaining(`/project/${projectId}/widgets/`),
      });

      await expect(
        prisma.dashboardWidget.findFirst({
          where: { id: result.id, projectId },
        }),
      ).resolves.toMatchObject({
        id: result.id,
        projectId,
        view: "OBSERVATIONS",
      });

      await expect(
        verifyAuditLog({
          projectId,
          apiKeyId,
          resourceType: "dashboardWidget",
          resourceId: result.id,
          action: "create",
        }),
      ).resolves.toMatchObject({ resourceId: result.id, action: "create" });
    });
  });

  describe("dashboard CRUD tools", () => {
    const createWidgetForTest = async (
      setup: Awaited<ReturnType<typeof createMcpTestSetup>>,
    ) =>
      (await handleCreateDashboardWidget(
        {
          name: `mcp-widget-${nanoid()}`,
          description: "Created by MCP",
          view: "observations",
          dimensions: [],
          metrics: [{ measure: "count", agg: "count" }],
          filters: [],
          chartType: "NUMBER",
          chartConfig: { type: "NUMBER" },
        },
        setup.context,
      )) as { id: string };

    it("runs the dashboard and placement write lifecycle", async () => {
      const setup = await createMcpTestSetup();
      const created = await createWidgetForTest(setup);
      const newName = `mcp-widget-renamed-${nanoid()}`;

      await expect(
        handleUpdateDashboardWidget(
          { widgetId: created.id, name: newName },
          setup.context,
        ),
      ).resolves.toMatchObject({ id: created.id, name: newName });

      const dashboard = (await handleCreateDashboard(
        { name: `mcp-dashboard-${nanoid()}`, description: "" },
        setup.context,
      )) as { id: string };

      await expect(
        handleUpdateDashboard(
          { dashboardId: dashboard.id, name: "MCP dashboard updated" },
          setup.context,
        ),
      ).resolves.toMatchObject({
        id: dashboard.id,
        name: "MCP dashboard updated",
      });

      const added = (await handleAddDashboardPlacement(
        { dashboardId: dashboard.id, type: "widget", widgetId: created.id },
        setup.context,
      )) as { id: string } & Record<string, unknown>;

      expect(added).toEqual({
        type: "widget",
        id: expect.any(String),
        widgetId: created.id,
        x: 0,
        y: 0,
        width: 6,
        height: 6,
      });

      await expect(
        handleUpdateDashboardPlacement(
          {
            dashboardId: dashboard.id,
            placementId: added.id,
            x: 4,
            width: 4,
          },
          setup.context,
        ),
      ).resolves.toMatchObject({ id: added.id, x: 4, width: 4 });
      await expect(
        handleDeleteDashboardPlacement(
          { dashboardId: dashboard.id, placementId: added.id },
          setup.context,
        ),
      ).resolves.toEqual({ message: "Placement successfully deleted" });
      await expect(
        handleDeleteDashboardWidget({ widgetId: created.id }, setup.context),
      ).resolves.toEqual({
        message: "Dashboard widget successfully deleted",
      });
      await expect(
        handleDeleteDashboard({ dashboardId: dashboard.id }, setup.context),
      ).resolves.toEqual({ message: "Dashboard successfully deleted" });
      await expect(
        prisma.dashboardWidget.findUnique({ where: { id: created.id } }),
      ).resolves.toBeNull();
      await expect(
        prisma.dashboard.findUnique({ where: { id: dashboard.id } }),
      ).resolves.toBeNull();
    });

    it("uses context.projectId for dashboard write isolation", async () => {
      const owner = await createMcpTestSetup();
      const other = await createMcpTestSetup();
      const created = await createWidgetForTest(owner);
      const dashboard = (await handleCreateDashboard(
        { name: `private-mcp-dashboard-${nanoid()}`, description: "" },
        owner.context,
      )) as { id: string };
      const placement = (await handleAddDashboardPlacement(
        { dashboardId: dashboard.id, type: "widget", widgetId: created.id },
        owner.context,
      )) as { id: string };

      await expect(
        handleUpdateDashboard(
          { dashboardId: dashboard.id, name: "Cross-project rename" },
          other.context,
        ),
      ).rejects.toThrow(/not found/i);
      await expect(
        handleUpdateDashboardWidget(
          { widgetId: created.id, name: "Cross-project widget rename" },
          other.context,
        ),
      ).rejects.toThrow(/not found/i);
      await expect(
        handleUpdateDashboardPlacement(
          {
            dashboardId: dashboard.id,
            placementId: placement.id,
            x: 4,
          },
          other.context,
        ),
      ).rejects.toThrow(/not found/i);

      await expect(
        handleGetDashboard({ dashboardId: dashboard.id }, owner.context),
      ).resolves.toMatchObject({
        name: expect.stringContaining("private-mcp-dashboard-"),
        definition: {
          widgets: [expect.objectContaining({ id: placement.id, x: 0 })],
        },
      });
      await expect(
        handleGetDashboardWidget({ widgetId: created.id }, owner.context),
      ).resolves.toMatchObject({
        id: created.id,
        name: expect.stringContaining("mcp-widget-"),
      });
    });

    it("rejects widget placements without a widgetId", async () => {
      const setup = await createMcpTestSetup();
      const dashboard = (await handleCreateDashboard(
        { name: `mcp-dashboard-${nanoid()}`, description: "" },
        setup.context,
      )) as { id: string };

      await expect(
        handleAddDashboardPlacement(
          { dashboardId: dashboard.id, type: "widget", id: "placement-1" },
          setup.context,
        ),
      ).rejects.toThrow(/widgetId is required/);
    });

    it("rejects dashboard updates without any patch field", async () => {
      const setup = await createMcpTestSetup();
      const dashboard = (await handleCreateDashboard(
        { name: `mcp-dashboard-${nanoid()}`, description: "" },
        setup.context,
      )) as { id: string };

      await expect(
        handleUpdateDashboard({ dashboardId: dashboard.id }, setup.context),
      ).rejects.toThrow(/at least one field/i);
    });
  });

  describe("createTextPrompt tool", () => {
    it("should create a simple text prompt", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "You are a helpful assistant.",
        },
        context,
      )) as {
        id: string;
        name: string;
        version: number;
        type: string;
        labels: string[];
        message: string;
      };

      expect(result.id).toBeDefined();
      expect(result.name).toBe(promptName);
      expect(result.version).toBe(1);
      expect(result.type).toBe("text");
      // First version automatically gets 'latest' label
      expect(result.labels).toContain("latest");
      expect(result.message).toContain("Successfully created");
    });

    it("should create text prompt with non-production labels", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Staged prompt",
          labels: ["staged", "stable"],
        },
        context,
      )) as {
        labels: string[];
        message: string;
      };

      expect(result.labels).toEqual(
        expect.arrayContaining(["staged", "stable"]),
      );
      expect(result.message).toContain("staged");
    });

    it("should reject text prompt creation with the production label", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      await expect(
        handleCreateTextPrompt(
          {
            name: promptName,
            prompt: "Production prompt",
            labels: ["production"],
          },
          context,
        ),
      ).rejects.toThrow(/production.*cannot be assigned/i);
    });

    it("should create text prompt with config", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test with config",
          config: { model: "gpt-4", temperature: 0.7 },
        },
        context,
      )) as {
        config: Record<string, unknown>;
      };

      expect(result.config).toEqual({ model: "gpt-4", temperature: 0.7 });
    });

    it("should create text prompt with tags", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test with tags",
          tags: ["experimental", "v2"],
        },
        context,
      )) as {
        tags: string[];
      };

      expect(result.tags).toEqual(["experimental", "v2"]);
    });

    it("should create text prompt with commit message", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test with commit message",
          commitMessage: "Initial production version",
        },
        context,
      )) as {
        id: string;
      };

      // Verify the commit message is stored
      const prompt = await prisma.prompt.findUnique({
        where: { id: result.id },
      });
      expect(prompt?.commitMessage).toBe("Initial production version");
    });

    it("should auto-increment version for same prompt name", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      // Create first version
      const result1 = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Version 1",
        },
        context,
      )) as { version: number };

      // Create second version
      const result2 = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Version 2",
        },
        context,
      )) as { version: number };

      expect(result1.version).toBe(1);
      expect(result2.version).toBe(2);
    });

    it("should create audit log entry", async () => {
      const { context, projectId, apiKeyId } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Audited prompt",
        },
        context,
      )) as { id: string };

      const auditLogEntry = await verifyAuditLog({
        projectId,
        resourceType: "prompt",
        resourceId: result.id,
        action: "create",
        apiKeyId,
      });

      expect(auditLogEntry.after).toBeDefined();
      expect(auditLogEntry.before).toBeNull();
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();

      const promptName = `isolated-${nanoid()}`;

      // Create prompt in project 1
      const result1 = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Project 1 prompt",
        },
        context1,
      )) as { id: string };

      // Verify it's in project 1
      const prompt = await prisma.prompt.findUnique({
        where: { id: result1.id },
      });
      expect(prompt?.projectId).toBe(projectId1);
    });

    it("should support template variables in prompt", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Hello {{name}}, welcome to {{service}}!",
        },
        context,
      )) as { id: string };

      const prompt = await prisma.prompt.findUnique({
        where: { id: result.id },
      });
      expect(prompt?.prompt).toBe("Hello {{name}}, welcome to {{service}}!");
    });

    it("should ignore 'latest' in user-provided labels (auto-managed)", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      // 'latest' is auto-managed, so if user provides it, it's ignored
      // but the system will still add 'latest' automatically
      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test",
          labels: ["latest", "stable"],
        },
        context,
      )) as { labels: string[] };

      // Should have 'latest' (auto) and 'stable' (user-provided)
      expect(result.labels).toContain("latest");
      expect(result.labels).toContain("stable");
    });

    it("should set createdBy to API", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `text-prompt-${nanoid()}`;

      const result = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test",
        },
        context,
      )) as { createdBy: string };

      expect(result.createdBy).toBe("API");
    });
  });

  describe("createChatPrompt tool", () => {
    it("should create a simple chat prompt", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "Help me with {{task}}" },
          ],
        },
        context,
      )) as {
        id: string;
        name: string;
        version: number;
        type: string;
        labels: string[];
        message: string;
      };

      expect(result.id).toBeDefined();
      expect(result.name).toBe(promptName);
      expect(result.version).toBe(1);
      expect(result.type).toBe("chat");
      // First version automatically gets 'latest' label
      expect(result.labels).toContain("latest");
      expect(result.message).toContain("Successfully created");
    });

    it("should create chat prompt with non-production labels", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "System instruction" }],
          labels: ["staged"],
        },
        context,
      )) as {
        labels: string[];
      };

      expect(result.labels).toContain("staged");
    });

    it("should reject chat prompt creation with the production label", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      await expect(
        handleCreateChatPrompt(
          {
            name: promptName,
            prompt: [{ role: "system", content: "System instruction" }],
            labels: ["production"],
          },
          context,
        ),
      ).rejects.toThrow(/production.*cannot be assigned/i);
    });

    it("should create chat prompt with multiple message roles", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const messages = [
        { role: "system", content: "You are an expert." },
        { role: "user", content: "What is {{topic}}?" },
        { role: "assistant", content: "I will explain {{topic}}." },
      ];

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: messages,
        },
        context,
      )) as { id: string };

      const prompt = await prisma.prompt.findUnique({
        where: { id: result.id },
      });

      expect(prompt?.prompt).toEqual(messages);
    });

    it("should create chat prompt with config", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "Test" }],
          config: { model: "gpt-4-turbo", maxTokens: 1000 },
        },
        context,
      )) as {
        config: Record<string, unknown>;
      };

      expect(result.config).toEqual({ model: "gpt-4-turbo", maxTokens: 1000 });
    });

    it("should create chat prompt with tags", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "Test" }],
          tags: ["multi-turn", "conversational"],
        },
        context,
      )) as {
        tags: string[];
      };

      expect(result.tags).toEqual(["multi-turn", "conversational"]);
    });

    it("should auto-increment version for same prompt name", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result1 = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "V1" }],
        },
        context,
      )) as { version: number };

      const result2 = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "V2" }],
        },
        context,
      )) as { version: number };

      expect(result1.version).toBe(1);
      expect(result2.version).toBe(2);
    });

    it("should create audit log entry", async () => {
      const { context, projectId, apiKeyId } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "Audited" }],
        },
        context,
      )) as { id: string };

      const auditLogEntry = await verifyAuditLog({
        projectId,
        resourceType: "prompt",
        resourceId: result.id,
        action: "create",
        apiKeyId,
      });

      expect(auditLogEntry.after).toBeDefined();
      expect(auditLogEntry.before).toBeNull();
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();

      const promptName = `isolated-chat-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "Project 1" }],
        },
        context1,
      )) as { id: string };

      const prompt = await prisma.prompt.findUnique({
        where: { id: result.id },
      });
      expect(prompt?.projectId).toBe(projectId1);
    });

    it("should support template variables in messages", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [
            { role: "system", content: "You are a {{domain}} expert." },
            { role: "user", content: "Explain {{concept}} to me." },
          ],
        },
        context,
      )) as { id: string };

      const prompt = await prisma.prompt.findUnique({
        where: { id: result.id },
      });

      const messages = prompt?.prompt as Array<{
        role: string;
        content: string;
      }>;
      expect(messages[0].content).toContain("{{domain}}");
      expect(messages[1].content).toContain("{{concept}}");
    });

    it("should reject empty message array", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      // Empty array is now rejected - chat prompts need at least one message
      await expect(
        handleCreateChatPrompt(
          {
            name: promptName,
            prompt: [],
          },
          context,
        ),
      ).rejects.toMatchObject({
        code: -32602, // INVALID_PARAMS
        message: expect.stringContaining(
          "Chat prompts must have at least one message",
        ),
      });
    });

    it("should set createdBy to API", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `chat-prompt-${nanoid()}`;

      const result = (await handleCreateChatPrompt(
        {
          name: promptName,
          prompt: [{ role: "system", content: "Test" }],
        },
        context,
      )) as { createdBy: string };

      expect(result.createdBy).toBe("API");
    });
  });

  describe("updatePromptLabels tool", () => {
    it("should update labels for a prompt version", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `update-labels-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: [],
        version: 1,
      });

      const result = (await handleUpdatePromptLabels(
        {
          name: promptName,
          version: 1,
          newLabels: ["production"],
        },
        context,
      )) as {
        id: string;
        name: string;
        version: number;
        labels: string[];
        message: string;
      };

      expect(result.name).toBe(promptName);
      expect(result.version).toBe(1);
      expect(result.labels).toContain("production");
      expect(result.message).toContain("Successfully updated");
    });

    it("should remove labels from other versions (label uniqueness)", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `label-unique-${nanoid()}`;

      // Create v1 with production label
      await createPromptInDb({
        name: promptName,
        prompt: "V1",
        projectId,
        labels: ["production"],
        version: 1,
      });

      // Create v2 without labels
      await createPromptInDb({
        name: promptName,
        prompt: "V2",
        projectId,
        labels: [],
        version: 2,
      });

      // Move production to v2
      await handleUpdatePromptLabels(
        {
          name: promptName,
          version: 2,
          newLabels: ["production"],
        },
        context,
      );

      // Verify v1 no longer has production
      const v1 = await prisma.prompt.findFirst({
        where: { projectId, name: promptName, version: 1 },
      });
      expect(v1?.labels).not.toContain("production");

      // Verify v2 now has production
      const v2 = await prisma.prompt.findFirst({
        where: { projectId, name: promptName, version: 2 },
      });
      expect(v2?.labels).toContain("production");
    });

    it("should allow setting multiple labels", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `multi-labels-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: [],
        version: 1,
      });

      const result = (await handleUpdatePromptLabels(
        {
          name: promptName,
          version: 1,
          newLabels: ["staging", "testing", "qa"],
        },
        context,
      )) as {
        labels: string[];
      };

      expect(result.labels).toEqual(
        expect.arrayContaining(["staging", "testing", "qa"]),
      );
    });

    it("should add new labels to existing labels (additive behavior)", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `add-labels-${nanoid()}`;

      // Create via handler so it gets 'latest' automatically
      const created = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test",
          labels: ["stable"],
        },
        context,
      )) as { version: number; labels: string[] };

      expect(created.labels).toContain("stable");
      expect(created.labels).toContain("latest");

      // The updatePromptLabels action ADDS labels, not replaces them
      const result = (await handleUpdatePromptLabels(
        {
          name: promptName,
          version: created.version,
          newLabels: ["staging"],
        },
        context,
      )) as {
        labels: string[];
        message: string;
      };

      // Should have all labels: original + new
      expect(result.labels).toContain("latest");
      expect(result.labels).toContain("stable");
      expect(result.labels).toContain("staging");
    });

    it("should throw error for non-existent prompt", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleUpdatePromptLabels(
          {
            name: "non-existent",
            version: 1,
            newLabels: ["production"],
          },
          context,
        ),
      ).rejects.toThrow(/not found/i);
    });

    it("should throw error for non-existent version", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `version-check-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        version: 1,
      });

      await expect(
        handleUpdatePromptLabels(
          {
            name: promptName,
            version: 999,
            newLabels: ["production"],
          },
          context,
        ),
      ).rejects.toThrow(/not found/i);
    });

    it("should create audit log entry with before and after states", async () => {
      const { context, projectId, apiKeyId } = await createMcpTestSetup();
      const promptName = `audit-update-${nanoid()}`;

      // Create via handler to get proper structure
      const created = (await handleCreateTextPrompt(
        {
          name: promptName,
          prompt: "Test",
          labels: ["staging"],
        },
        context,
      )) as { version: number };

      const result = (await handleUpdatePromptLabels(
        {
          name: promptName,
          version: created.version,
          newLabels: ["qa"],
        },
        context,
      )) as { id: string };

      const auditLogEntry = await verifyAuditLog({
        projectId,
        resourceType: "prompt",
        resourceId: result.id,
        action: "update",
        apiKeyId,
      });

      expect(auditLogEntry.before).toBeDefined();
      expect(auditLogEntry.after).toBeDefined();

      // Audit log stores JSON strings - parse them
      const beforeState =
        typeof auditLogEntry.before === "string"
          ? (JSON.parse(auditLogEntry.before) as Record<string, unknown>)
          : (auditLogEntry.before as Record<string, unknown>);
      const afterState =
        typeof auditLogEntry.after === "string"
          ? (JSON.parse(auditLogEntry.after) as Record<string, unknown>)
          : (auditLogEntry.after as Record<string, unknown>);

      // Verify the before and after are different and contain labels
      expect(beforeState).toHaveProperty("labels");
      expect(afterState).toHaveProperty("labels");
      // Should have the new label added
      expect(afterState.labels).toContain("qa");
      // Should preserve original labels (additive behavior)
      expect(afterState.labels).toContain("staging");
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();
      const { context: context2 } = await createMcpTestSetup();

      const promptName = `isolated-update-${nanoid()}`;

      // Create prompt in project 1
      await createPromptInDb({
        name: promptName,
        prompt: "Project 1",
        projectId: projectId1,
        version: 1,
      });

      // Project 2 should not be able to update it
      await expect(
        handleUpdatePromptLabels(
          {
            name: promptName,
            version: 1,
            newLabels: ["production"],
          },
          context2,
        ),
      ).rejects.toThrow(/not found/i);

      // Project 1 should be able to update it
      const result = await handleUpdatePromptLabels(
        {
          name: promptName,
          version: 1,
          newLabels: ["production"],
        },
        context1,
      );

      expect(result).toBeDefined();
    });

    it("should reject 'latest' label", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `latest-reject-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        version: 1,
      });

      // 'latest' is auto-managed and cannot be set manually
      await expect(
        handleUpdatePromptLabels(
          {
            name: promptName,
            version: 1,
            newLabels: ["latest"],
          },
          context,
        ),
      ).rejects.toThrow();
    });

    it("should handle special characters in prompt name", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `special!@#$-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        version: 1,
      });

      const result = (await handleUpdatePromptLabels(
        {
          name: promptName,
          version: 1,
          newLabels: ["production"],
        },
        context,
      )) as { name: string };

      expect(result.name).toBe(promptName);
    });
  });
});
