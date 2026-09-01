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

// Skip evaluator configuration validation so these tool tests do not require
// a provisioned default eval model.
vi.mock(
  "@/src/features/evals/server/evaluator-preflight",
  async (importActual) => ({
    ...(await importActual<object>()),
    getEvaluatorDefinitionConfigurationError: vi.fn(async () => null),
    getEvaluatorDefinitionPreflightError: vi.fn(async () => null),
  }),
);

import { prisma, Role } from "@langfuse/shared/src/db";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createInAppAgentMcpContext,
  createMcpTestSetup,
  createPromptInDb,
  createUserWithOrgRole,
  mcpEvalOutputDefinition,
  protectPromptLabel,
  verifyAuditLog,
  verifyToolAnnotations,
} from "./mcp-helpers";
import {
  DeleteDatasetRunMcpInput,
  PostDatasetItemMcpInput,
} from "@/src/features/mcp/server/datasets/schema";

// Import MCP tool handlers directly
import { handleCreateTextPrompt } from "@/src/features/mcp/server/prompts/tools/createTextPrompt";
import { handleCreateChatPrompt } from "@/src/features/mcp/server/prompts/tools/createChatPrompt";
import { handleUpdatePromptLabels } from "@/src/features/mcp/server/prompts/tools/updatePromptLabels";
import { handleCreateAnnotationQueue } from "@/src/features/mcp/server/annotationQueues/tools";
import {
  createEvaluatorTool,
  handleCreateEvaluator,
} from "@/src/features/mcp/server/evals/tools/createEvaluator";
import {
  updateEvaluatorTool,
  handleUpdateEvaluator,
} from "@/src/features/mcp/server/evals/tools/updateEvaluator";
import {
  createEvaluationRuleTool,
  handleCreateEvaluationRule,
} from "@/src/features/mcp/server/evals/tools/createEvaluationRule";
import {
  updateEvaluationRuleTool,
  handleUpdateEvaluationRule,
} from "@/src/features/mcp/server/evals/tools/updateEvaluationRule";
import {
  deleteEvaluationRuleTool,
  handleDeleteEvaluationRule,
} from "@/src/features/mcp/server/evals/tools/deleteEvaluationRule";
import {
  deleteEvaluatorTool,
  handleDeleteEvaluator,
} from "@/src/features/mcp/server/evals/tools/deleteEvaluator";
import {
  handleTestEvaluator,
  testEvaluatorTool,
} from "@/src/features/mcp/server/evals/tools/testEvaluator";
import { evalsFeature } from "@/src/features/mcp/server/evals";
import { handleGetEvaluationRule } from "@/src/features/mcp/server/evals/tools/getEvaluationRule";
import { EvaluatorService } from "@/src/features/evals/v2/server/evaluators/evaluatorService";
import {
  attachEvaluatorToEvaluationRuleTool,
  detachEvaluatorFromEvaluationRuleTool,
  handleAttachEvaluatorToEvaluationRule,
  handleDetachEvaluatorFromEvaluationRule,
} from "@/src/features/mcp/server/evals/tools/manageEvaluationRuleEvaluators";
import {
  createDashboardWidgetTool,
  handleCreateDashboardWidget,
} from "@/src/features/mcp/server/dashboardWidgets/tools/createDashboardWidget";
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
} from "@/src/features/mcp/server/dashboardWidgets/tools/dashboardCrud";

const createScoreConfig = async (projectId: string) =>
  prisma.scoreConfig.create({
    data: {
      id: nanoid(),
      projectId,
      name: `mcp-score-${nanoid()}`,
      dataType: "NUMERIC",
    },
  });

const createStableLlmEvaluatorForMcpWriteTest = async (
  setup: Awaited<ReturnType<typeof createMcpTestSetup>>,
  name = `mcp-stable-eval-${nanoid()}`,
) =>
  (await handleCreateEvaluator(
    {
      name,
      type: "LLM_AS_JUDGE",
      prompt: "Judge {{input}} against {{output}}",
      outputDefinition: mcpEvalOutputDefinition,
      variableMapping: [
        { templateVariable: "input", selectedColumnId: "input" },
        { templateVariable: "output", selectedColumnId: "output" },
      ],
    },
    setup.context,
  )) as { id: string; name: string; versions: Array<{ version: number }> };

const createLlmEvaluationRuleForMcpWriteTest = async (
  setup: Awaited<ReturnType<typeof createMcpTestSetup>>,
) => {
  const evaluatorName = `mcp-eval-${nanoid()}`;
  const evaluator = await createStableLlmEvaluatorForMcpWriteTest(
    setup,
    evaluatorName,
  );
  const ruleName = `mcp-rule-${nanoid()}`;
  const rule = (await handleCreateEvaluationRule(
    {
      name: ruleName,
      evaluatorAssignments: [
        {
          evaluatorId: evaluator.id,
          variableMapping: [
            { variable: "input", source: "input" },
            { variable: "output", source: "output" },
          ],
        },
      ],
      enabled: true,
      sampling: 1,
      filter: [
        { column: "version", operator: "=", value: "1.0.0", type: "string" },
      ],
    },
    setup.context,
  )) as { id: string; name: string; sampling: number };

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

  describe("stable evaluator tools", () => {
    it("tests the latest saved evaluator against a project observation", async () => {
      const setup = await createMcpTestSetup();
      const evaluator = await createStableLlmEvaluatorForMcpWriteTest(setup);
      await handleUpdateEvaluator(
        {
          evaluatorId: evaluator.id,
          name: evaluator.name,
          type: "LLM_AS_JUDGE",
          prompt: "Latest evaluator prompt for {{input}}",
          outputDefinition: mcpEvalOutputDefinition,
          variableMapping: [
            { templateVariable: "input", selectedColumnId: "input" },
          ],
        },
        setup.context,
      );

      const observationId = nanoid();
      const traceId = nanoid();
      const startTime = "2026-08-11T12:00:00.000Z";
      const unifiedResult = {
        success: true as const,
        result: {
          dataType: "NUMERIC" as const,
          score: 1,
          reasoning: "passes",
        },
        interpolatedPrompt: "Latest evaluator prompt for sample input",
        model: "test-model",
        provider: "test-provider",
        executionTraceId: "execution-trace-id",
        estimatedCostUsd: null,
        durationMs: 25,
      };
      const testEvaluatorSpy = vi
        .spyOn(EvaluatorService.prototype, "testEvaluator")
        .mockResolvedValue(unifiedResult);

      try {
        verifyToolAnnotations(testEvaluatorTool, { expensiveHint: true });
        expect(testEvaluatorTool.annotations?.readOnlyHint).not.toBe(true);
        expect(testEvaluatorTool.annotations?.destructiveHint).not.toBe(true);
        expect(testEvaluatorTool.inputSchema.properties).toEqual(
          expect.objectContaining({
            evaluatorId: expect.any(Object),
            type: expect.any(Object),
            prompt: expect.any(Object),
            sourceCode: expect.any(Object),
            observationId: expect.any(Object),
            traceId: expect.any(Object),
            startTime: expect.any(Object),
          }),
        );
        expect(
          evalsFeature.tools.some(
            ({ definition }) => definition.name === "testEvaluator",
          ),
        ).toBe(true);

        await expect(
          handleTestEvaluator(
            {
              evaluatorId: evaluator.id,
              observationId,
              traceId,
              startTime,
            } as never,
            setup.context,
          ),
        ).resolves.toEqual(unifiedResult);
        expect(testEvaluatorSpy).toHaveBeenNthCalledWith(1, {
          orgId: setup.orgId,
          projectId: setup.projectId,
          evaluatorId: evaluator.id,
          observationId,
          traceId,
          startTime: new Date(startTime),
        });

        await expect(
          handleTestEvaluator(
            {
              type: "CODE",
              sourceCode: "return { score: 1 };",
              sourceCodeLanguage: "TYPESCRIPT",
              observationId,
              traceId,
              startTime,
            } as never,
            setup.context,
          ),
        ).resolves.toEqual(unifiedResult);
        expect(testEvaluatorSpy).toHaveBeenNthCalledWith(2, {
          orgId: setup.orgId,
          projectId: setup.projectId,
          definition: {
            type: "CODE",
            sourceCode: "return { score: 1 };",
            sourceCodeLanguage: "TYPESCRIPT",
          },
          observationId,
          traceId,
          startTime: new Date(startTime),
        });

        await expect(
          handleTestEvaluator(
            { observationId, traceId, startTime } as never,
            setup.context,
          ),
        ).rejects.toThrow(
          "Provide either evaluatorId or a draft evaluator definition, but not both.",
        );
        await expect(
          handleTestEvaluator(
            {
              evaluatorId: evaluator.id,
              type: "CODE",
              sourceCode: "return { score: 1 };",
              sourceCodeLanguage: "TYPESCRIPT",
              observationId,
              traceId,
              startTime,
            } as never,
            setup.context,
          ),
        ).rejects.toThrow(
          "Provide either evaluatorId or a draft evaluator definition, but not both.",
        );
        await expect(
          handleTestEvaluator(
            {
              evaluatorId: evaluator.id,
              observationId,
              traceId,
              startTime: null,
            } as never,
            setup.context,
          ),
        ).rejects.toThrow();
      } finally {
        testEvaluatorSpy.mockRestore();
      }
    });

    it("creates and versions an evaluator by stable id", async () => {
      const setup = await createMcpTestSetup();
      verifyToolAnnotations(createEvaluatorTool, { destructiveHint: true });
      verifyToolAnnotations(updateEvaluatorTool, { destructiveHint: true });
      const evaluator = await createStableLlmEvaluatorForMcpWriteTest(setup);

      const updatedEvaluator = (await handleUpdateEvaluator(
        {
          evaluatorId: evaluator.id,
          name: evaluator.name,
          type: "LLM_AS_JUDGE",
          prompt: "Judge {{input}} very strictly",
          outputDefinition: mcpEvalOutputDefinition,
        },
        setup.context,
      )) as { id: string; versions: Array<{ version: number }> };

      expect(updatedEvaluator).toMatchObject({ id: evaluator.id });
      expect(updatedEvaluator.versions).toEqual([
        expect.objectContaining({ version: 2 }),
      ]);
    });

    it("rejects mappings when creating or updating code evaluators", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleCreateEvaluator(
          {
            name: `mcp-code-eval-${nanoid()}`,
            type: "CODE",
            sourceCode: "export function evaluate() { return { score: 1 }; }",
            sourceCodeLanguage: "TYPESCRIPT",
            variableMapping: [
              { templateVariable: "input", selectedColumnId: "input" },
            ],
          },
          context,
        ),
      ).rejects.toThrow(
        "Code evaluator mappings are managed by Langfuse and cannot be provided.",
      );

      const evaluator = (await handleCreateEvaluator(
        {
          name: `mcp-code-eval-${nanoid()}`,
          type: "CODE",
          sourceCode: "export function evaluate() { return { score: 1 }; }",
          sourceCodeLanguage: "TYPESCRIPT",
        },
        context,
      )) as { id: string; name: string };

      await expect(
        handleUpdateEvaluator(
          {
            evaluatorId: evaluator.id,
            name: evaluator.name,
            type: "CODE",
            sourceCode: "export function evaluate() { return { score: 0 }; }",
            sourceCodeLanguage: "TYPESCRIPT",
            variableMapping: [
              { templateVariable: "output", selectedColumnId: "output" },
            ],
          },
          context,
        ),
      ).rejects.toThrow(
        "Code evaluator mappings are managed by Langfuse and cannot be provided.",
      );
    });
  });

  describe("createEvaluationRule tool", () => {
    it("should have destructiveHint annotation", () => {
      verifyToolAnnotations(createEvaluationRuleTool, {
        destructiveHint: true,
      });
    });

    it("addresses project evaluators by stable id", () => {
      const properties = createEvaluationRuleTool.inputSchema.properties;

      expect(properties).toHaveProperty("evaluatorAssignments");
      expect(properties).not.toHaveProperty("evaluatorId");
      expect(properties).not.toHaveProperty("evaluator");
    });

    it("creates a rule with multiple evaluators created through MCP", async () => {
      const setup = await createMcpTestSetup();
      const evaluatorName = `duplicate-name-evaluator-${nanoid()}`;
      const [firstEvaluator, secondEvaluator] = await Promise.all([
        createStableLlmEvaluatorForMcpWriteTest(setup, evaluatorName),
        createStableLlmEvaluatorForMcpWriteTest(setup, evaluatorName),
      ]);

      const rule = (await handleCreateEvaluationRule(
        {
          name: `mcp-stable-rule-${nanoid()}`,
          evaluatorAssignments: [
            {
              evaluatorId: firstEvaluator.id,
              variableMapping: [
                { variable: "input", source: "input" },
                { variable: "output", source: "output" },
              ],
            },
            { evaluatorId: secondEvaluator.id },
          ],
          enabled: true,
          sampling: 1,
          filter: [],
        },
        setup.context,
      )) as {
        id: string;
        evaluators: Array<{
          evaluatorId: string;
          variableMapping: unknown;
        }>;
      };

      expect(rule).toMatchObject({
        enabled: true,
        evaluators: expect.arrayContaining([
          expect.objectContaining({
            evaluatorId: firstEvaluator.id,
            variableMapping: [
              { variable: "input", source: "input" },
              { variable: "output", source: "output" },
            ],
          }),
          expect.objectContaining({
            evaluatorId: secondEvaluator.id,
            variableMapping: null,
          }),
        ]),
      });
      await expect(
        prisma.evaluationRuleEvaluatorAssignment.count({
          where: {
            projectId: setup.projectId,
            evaluationRuleId: rule.id,
          },
        }),
      ).resolves.toBe(2);
    });

    it("rejects an evaluator id from another project", async () => {
      const setup = await createMcpTestSetup();
      const otherSetup = await createMcpTestSetup();
      const evaluator =
        await createStableLlmEvaluatorForMcpWriteTest(otherSetup);

      await expect(
        handleCreateEvaluationRule(
          {
            name: `cross-project-rule-${nanoid()}`,
            evaluatorAssignments: [{ evaluatorId: evaluator.id }],
            enabled: true,
            sampling: 1,
            filter: [],
          },
          setup.context,
        ),
      ).rejects.toThrow(/not found/i);
    });

    it("rejects unsupported filters without creating a rule", async () => {
      const setup = await createMcpTestSetup();
      const evaluator = await createStableLlmEvaluatorForMcpWriteTest(setup);

      await expect(
        handleCreateEvaluationRule(
          {
            name: `invalid-filter-rule-${nanoid()}`,
            evaluatorAssignments: [{ evaluatorId: evaluator.id }],
            enabled: true,
            sampling: 1,
            filter: [
              {
                column: "totalCost",
                type: "number",
                operator: ">",
                value: 0.01,
              },
            ],
          },
          setup.context,
        ),
      ).rejects.toThrow('Filter column "totalCost" is not supported');
      await expect(
        prisma.evaluationRule.count({
          where: { projectId: setup.projectId },
        }),
      ).resolves.toBe(0);
    });

    it("should create an evaluation rule and audit the write", async () => {
      const setup = await createMcpTestSetup();
      const { projectId, apiKeyId } = setup;

      const { rule } = await createLlmEvaluationRuleForMcpWriteTest(setup);

      expect(rule).toMatchObject({ sampling: 1 });
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

      const evaluator = (await handleCreateEvaluator(
        {
          name: evaluatorName,
          type: "CODE",
          sourceCode: "export function evaluate() { return { score: 1 }; }",
          sourceCodeLanguage: "TYPESCRIPT",
        },
        context,
      )) as { id: string };

      const rule = (await handleCreateEvaluationRule(
        {
          name: `mcp-code-rule-${nanoid()}`,
          evaluatorAssignments: [{ evaluatorId: evaluator.id }],
          enabled: true,
          sampling: 1,
          filter: [],
        },
        context,
      )) as { id: string };
      expect(rule.id).toBeDefined();
      await expect(
        prisma.evaluationRuleEvaluatorAssignment.findFirst({
          where: {
            evaluationRuleId: rule.id,
            evaluatorId: evaluator.id,
          },
        }),
      ).resolves.toMatchObject({
        variableMapping: null,
      });
    });

    it("should reject mappings for code evaluation rules", async () => {
      const { context } = await createMcpTestSetup();
      const evaluator = (await handleCreateEvaluator(
        {
          name: `mcp-code-eval-${nanoid()}`,
          type: "CODE",
          sourceCode: "export function evaluate() { return { score: 1 }; }",
          sourceCodeLanguage: "TYPESCRIPT",
        },
        context,
      )) as { id: string };

      await expect(
        handleCreateEvaluationRule(
          {
            name: `mcp-code-rule-${nanoid()}`,
            evaluatorAssignments: [
              {
                evaluatorId: evaluator.id,
                variableMapping: [{ variable: "output", source: "output" }],
              },
            ],
            enabled: true,
            sampling: 1,
            filter: [],
          },
          context,
        ),
      ).rejects.toThrow(
        "Code evaluator mappings are managed by Langfuse and cannot be provided.",
      );
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

  describe("evaluation rule evaluator assignment tools", () => {
    it("should have destructiveHint annotations", () => {
      verifyToolAnnotations(attachEvaluatorToEvaluationRuleTool, {
        destructiveHint: true,
      });
      verifyToolAnnotations(detachEvaluatorFromEvaluationRuleTool, {
        destructiveHint: true,
      });
    });

    it("attaches and detaches a stable evaluator and audits both writes", async () => {
      const setup = await createMcpTestSetup();
      const { rule } = await createLlmEvaluationRuleForMcpWriteTest(setup);
      const evaluator = await createStableLlmEvaluatorForMcpWriteTest(setup);
      const input = {
        evaluationRuleId: rule.id,
        evaluatorId: evaluator.id,
      };

      await expect(
        handleAttachEvaluatorToEvaluationRule(input, setup.context),
      ).resolves.toEqual(input);
      await expect(
        prisma.evaluationRuleEvaluatorAssignment.findUnique({
          where: {
            evaluationRuleId_evaluatorId: {
              evaluationRuleId: rule.id,
              evaluatorId: evaluator.id,
            },
          },
        }),
      ).resolves.toMatchObject({ variableMapping: null });

      await expect(
        handleDetachEvaluatorFromEvaluationRule(input, setup.context),
      ).resolves.toEqual(input);
      await expect(
        prisma.evaluationRuleEvaluatorAssignment.findUnique({
          where: {
            evaluationRuleId_evaluatorId: {
              evaluationRuleId: rule.id,
              evaluatorId: evaluator.id,
            },
          },
        }),
      ).resolves.toBeNull();
      await expect(
        verifyAuditLog({
          projectId: setup.projectId,
          apiKeyId: setup.apiKeyId,
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
      const evaluator = await createStableLlmEvaluatorForMcpWriteTest(setup);

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
        prisma.evaluator.findUnique({ where: { id: evaluator.id } }),
      ).resolves.toBeNull();
    });

    it("should reject an evaluator id from another project", async () => {
      const setup = await createMcpTestSetup();
      const otherSetup = await createMcpTestSetup();
      const evaluator =
        await createStableLlmEvaluatorForMcpWriteTest(otherSetup);

      await expect(
        handleDeleteEvaluator({ evaluatorId: evaluator.id }, setup.context),
      ).rejects.toThrow(/not found/i);

      await expect(
        prisma.evaluator.findUnique({ where: { id: evaluator.id } }),
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

    it("should list supported fields when widget dimensions are invalid", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleCreateDashboardWidget(
          {
            name: `mcp-widget-${nanoid()}`,
            description: "Created by MCP",
            view: "observations",
            dimensions: [{ field: "notAViewDimension" }],
            metrics: [{ measure: "count", agg: "count" }],
            filters: [],
            chartType: "BAR_TIME_SERIES",
            chartConfig: { type: "BAR_TIME_SERIES" },
          },
          context,
        ),
      ).rejects.toThrow(
        /supported dimensions for "observations":.*name.*getMetricsSchema/i,
      );
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

  describe("in-app-agent protected prompt labels", () => {
    it.each([
      {
        name: "rejects adding production with a MEMBER in-app-agent key",
        role: Role.MEMBER,
        inAppAgent: true,
        labels: ["production"],
        expectForbidden: true,
      },
      {
        name: "allows a MEMBER in-app-agent key to add a non-protected label",
        role: Role.MEMBER,
        inAppAgent: true,
        labels: ["staging"],
        expectForbidden: false,
      },
      {
        name: "allows an ADMIN in-app-agent key to add production",
        role: Role.ADMIN,
        inAppAgent: true,
        labels: ["production"],
        expectForbidden: false,
      },
      {
        name: "allows a regular project API key to add production",
        inAppAgent: false,
        labels: ["production"],
        expectForbidden: false,
      },
    ] as const)("$name", async (testCase) => {
      const setup = await createMcpTestSetup();
      await protectPromptLabel({
        projectId: setup.projectId,
        label: "production",
      });

      let context = setup.context;
      if (testCase.inAppAgent) {
        const { userId } = await createUserWithOrgRole({
          orgId: setup.orgId,
          role: testCase.role,
        });
        ({ context } = await createInAppAgentMcpContext({
          projectId: setup.projectId,
          orgId: setup.orgId,
          createdByUserId: userId,
        }));
      }

      const promptName = `protected-labels-${nanoid()}`;
      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId: setup.projectId,
        labels: [],
        version: 1,
      });

      const update = handleUpdatePromptLabels(
        {
          name: promptName,
          version: 1,
          newLabels: [...testCase.labels],
        },
        context,
      );

      if (testCase.expectForbidden) {
        await expect(update).rejects.toMatchObject({
          name: "McpError",
          message: expect.stringContaining("Access forbidden"),
        });

        const prompt = await prisma.prompt.findFirst({
          where: {
            projectId: setup.projectId,
            name: promptName,
            version: 1,
          },
        });
        for (const label of testCase.labels) {
          expect(prompt?.labels).not.toContain(label);
        }
      } else {
        await expect(update).resolves.toMatchObject({
          labels: expect.arrayContaining([...testCase.labels]),
        });
      }
    });

    it("rejects creating a prompt with a custom protected label using a MEMBER in-app-agent key", async () => {
      const setup = await createMcpTestSetup();
      const protectedLabel = "release-gate";
      await protectPromptLabel({
        projectId: setup.projectId,
        label: protectedLabel,
      });
      const { userId } = await createUserWithOrgRole({
        orgId: setup.orgId,
        role: Role.MEMBER,
      });
      const { context } = await createInAppAgentMcpContext({
        projectId: setup.projectId,
        orgId: setup.orgId,
        createdByUserId: userId,
      });
      const promptName = `member-create-protected-${nanoid()}`;

      await expect(
        handleCreateTextPrompt(
          {
            name: promptName,
            prompt: "Protected create",
            labels: [protectedLabel],
          },
          context,
        ),
      ).rejects.toMatchObject({
        name: "McpError",
        message: expect.stringContaining("Access forbidden"),
      });

      await expect(
        prisma.prompt.findFirst({
          where: { projectId: setup.projectId, name: promptName },
        }),
      ).resolves.toBeNull();
    });

    it("rejects adding production when the in-app-agent key has no creator", async () => {
      const setup = await createMcpTestSetup();
      await protectPromptLabel({
        projectId: setup.projectId,
        label: "production",
      });
      const { context } = await createInAppAgentMcpContext({
        projectId: setup.projectId,
        orgId: setup.orgId,
      });
      const promptName = `missing-creator-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId: setup.projectId,
        labels: [],
        version: 1,
      });

      await expect(
        handleUpdatePromptLabels(
          {
            name: promptName,
            version: 1,
            newLabels: ["production"],
          },
          context,
        ),
      ).rejects.toMatchObject({
        name: "McpError",
        message: expect.stringContaining("Access forbidden"),
      });
    });
  });
});
