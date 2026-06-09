import { v4 as uuidv4 } from "uuid";
import { LLMAdapter } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import {
  createMcpTestSetup,
  mockServerContext,
  verifyAuditLog,
} from "./mcp-helpers";
import "@/src/features/mcp/server/bootstrap";
import { toolRegistry } from "@/src/features/mcp/server/registry";
import { handleListEvaluators } from "@/src/features/mcp/features/evals/tools/listEvaluators";
import { handleGetEvaluator } from "@/src/features/mcp/features/evals/tools/getEvaluator";
import { handleCreateEvaluator } from "@/src/features/mcp/features/evals/tools/createEvaluator";
import { handleListEvaluationRules } from "@/src/features/mcp/features/evals/tools/listEvaluationRules";
import { handleGetEvaluationRule } from "@/src/features/mcp/features/evals/tools/getEvaluationRule";
import { handleCreateEvaluationRule } from "@/src/features/mcp/features/evals/tools/createEvaluationRule";
import { handleUpdateEvaluationRule } from "@/src/features/mcp/features/evals/tools/updateEvaluationRule";
import { handleDeleteEvaluationRule } from "@/src/features/mcp/features/evals/tools/deleteEvaluationRule";

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

const provisionDefaultEvalModel = async (projectId: string) => {
  const provider = `openai-${projectId}`;
  const llmApiKey = await prisma.llmApiKeys.create({
    data: {
      projectId,
      provider,
      adapter: LLMAdapter.OpenAI,
      secretKey: encrypt("sk-test"),
      displaySecretKey: "...test",
      baseURL: "https://api.openai.com/v1",
      customModels: [],
      withDefaultModels: true,
      extraHeaders: null,
      extraHeaderKeys: [],
    },
  });

  await prisma.defaultLlmModel.create({
    data: {
      projectId,
      llmApiKeyId: llmApiKey.id,
      provider,
      adapter: LLMAdapter.OpenAI,
      model: "gpt-4.1-mini",
    },
  });
};

const outputDefinition = {
  dataType: "NUMERIC" as const,
  reasoning: { description: "Why the score was assigned" },
  score: { description: "A score between 0 and 1" },
};

describe("MCP evals tools", () => {
  it("registers all eval tools and exposes read-only ones to in-app agent keys", async () => {
    const toolNames = (
      await toolRegistry.getToolDefinitions(mockServerContext())
    ).map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "listEvaluators",
        "getEvaluator",
        "createEvaluator",
        "listEvaluationRules",
        "getEvaluationRule",
        "createEvaluationRule",
        "updateEvaluationRule",
        "deleteEvaluationRule",
      ]),
    );

    const inAppToolNames = (
      await toolRegistry.getToolDefinitions(
        mockServerContext({ isInAppAgentKey: true }),
      )
    ).map((tool) => tool.name);

    expect(inAppToolNames).toEqual(
      expect.arrayContaining([
        "listEvaluators",
        "getEvaluator",
        "listEvaluationRules",
        "getEvaluationRule",
      ]),
    );
    // Mutating eval tools must not be reachable by in-app agent keys.
    expect(inAppToolNames).not.toContain("createEvaluator");
    expect(inAppToolNames).not.toContain("createEvaluationRule");
    expect(inAppToolNames).not.toContain("updateEvaluationRule");
    expect(inAppToolNames).not.toContain("deleteEvaluationRule");
  });

  it("covers the evaluator and evaluation-rule lifecycle", async () => {
    const { context, projectId, apiKeyId } = await createMcpTestSetup();
    await provisionDefaultEvalModel(projectId);

    const evaluatorName = `mcp-eval-${uuidv4().slice(0, 8)}`;

    // create evaluator
    const evaluator = (await handleCreateEvaluator(
      {
        name: evaluatorName,
        type: "llm_as_judge",
        prompt: "Judge {{input}} against {{output}}",
        outputDefinition,
        modelConfig: null,
      },
      context,
    )) as { id: string; name: string; type: string; variables: string[] };

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

    // list + get evaluator
    const evaluators = (await handleListEvaluators(
      { page: 1, limit: 50 },
      context,
    )) as { data: Array<{ id: string }> };
    expect(evaluators.data.map((item) => item.id)).toContain(evaluator.id);

    await expect(
      handleGetEvaluator({ evaluatorId: evaluator.id }, context),
    ).resolves.toMatchObject({ id: evaluator.id, name: evaluatorName });

    // create evaluation rule (disabled to skip model preflight on activation)
    const ruleName = `mcp-rule-${uuidv4().slice(0, 8)}`;
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
      context,
    )) as { id: string; name: string; target: string; sampling: number };

    expect(rule).toMatchObject({ name: ruleName, target: "observation" });
    await expect(
      verifyAuditLog({
        projectId,
        apiKeyId,
        resourceType: "job",
        resourceId: rule.id,
        action: "create",
      }),
    ).resolves.toMatchObject({ resourceId: rule.id, action: "create" });

    // list + get rule
    const rules = (await handleListEvaluationRules(
      { page: 1, limit: 50 },
      context,
    )) as { data: Array<{ id: string }> };
    expect(rules.data.map((item) => item.id)).toContain(rule.id);

    await expect(
      handleGetEvaluationRule({ evaluationRuleId: rule.id }, context),
    ).resolves.toMatchObject({ id: rule.id, name: ruleName });

    // update rule (untargeted patch)
    await expect(
      handleUpdateEvaluationRule(
        { evaluationRuleId: rule.id, sampling: 0.5 },
        context,
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

    // empty patch is rejected
    await expect(
      handleUpdateEvaluationRule({ evaluationRuleId: rule.id }, context),
    ).rejects.toThrow();

    // delete rule
    await expect(
      handleDeleteEvaluationRule({ evaluationRuleId: rule.id }, context),
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
      handleGetEvaluationRule({ evaluationRuleId: rule.id }, context),
    ).rejects.toThrow();
  });

  it("rejects cross-project access to evaluators and rules", async () => {
    const { context: sourceContext, projectId: sourceProjectId } =
      await createMcpTestSetup();
    const { context: targetContext } = await createMcpTestSetup();
    await provisionDefaultEvalModel(sourceProjectId);

    const evaluator = (await handleCreateEvaluator(
      {
        name: `mcp-eval-isolation-${uuidv4().slice(0, 8)}`,
        type: "llm_as_judge",
        prompt: "Judge {{input}}",
        outputDefinition,
        modelConfig: null,
      },
      sourceContext,
    )) as { id: string };

    await expect(
      handleGetEvaluator({ evaluatorId: evaluator.id }, targetContext),
    ).rejects.toThrow();
  });

  it("covers code evaluators and rejects mapping on code rules", async () => {
    const { context, projectId, apiKeyId } = await createMcpTestSetup();

    const evaluatorName = `mcp-code-eval-${uuidv4().slice(0, 8)}`;
    const evaluator = (await handleCreateEvaluator(
      {
        name: evaluatorName,
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

    // Code rules omit mapping — Langfuse injects a managed one.
    const rule = (await handleCreateEvaluationRule(
      {
        name: `mcp-code-rule-${uuidv4().slice(0, 8)}`,
        evaluator: { name: evaluatorName, scope: "project", type: "code" },
        enabled: false,
        target: "observation",
        filter: [],
      },
      context,
    )) as { id: string };
    expect(rule.id).toBeDefined();

    // Providing a mapping for a code-evaluator rule is rejected.
    await expect(
      handleCreateEvaluationRule(
        {
          name: `mcp-code-rule-${uuidv4().slice(0, 8)}`,
          evaluator: { name: evaluatorName, scope: "project", type: "code" },
          enabled: false,
          target: "observation",
          filter: [],
          mapping: [{ variable: "input", source: "input" }],
        },
        context,
      ),
    ).rejects.toThrow();
  });
});
