import { randomUUID } from "crypto";
import { getCodeEvalVariableMapping, LLMAdapter } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as evaluatorRepository from "@/src/features/evals/v2/server/evaluators/evaluatorRepository";
import { EvaluatorVersionConflictError } from "@/src/features/evals/v2/server/evaluators/evaluatorErrors";
import type { EvaluatorDefinitionForPersistence } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";

const orgIds: string[] = [];
let projectId = "";
let otherProjectId = "";
let creatorUserId = "";

const codeDefinition = (
  sourceCode = "return 1;",
): Extract<EvaluatorDefinitionForPersistence, { type: "CODE" }> => ({
  type: "CODE",
  sourceCode,
  sourceCodeLanguage: "TYPESCRIPT",
  variableMapping: getCodeEvalVariableMapping(),
});

const llmDefinition = (
  overrides: Partial<
    Extract<EvaluatorDefinitionForPersistence, { type: "LLM_AS_JUDGE" }>
  > = {},
): Extract<EvaluatorDefinitionForPersistence, { type: "LLM_AS_JUDGE" }> => ({
  type: "LLM_AS_JUDGE",
  prompt: "Judge {{output}}",
  promptMessages: [{ role: "user", content: "Judge {{output}}" }],
  provider: null,
  model: null,
  modelParams: null,
  vars: ["output"],
  variableMapping: null,
  outputDefinition: {
    dataType: "NUMERIC",
    score: { description: "Quality" },
    reasoning: { description: "Reasoning" },
  },
  ...overrides,
});

const createEvaluator = ({
  targetProjectId = projectId,
  name = `evaluator-${randomUUID()}`,
  description = null,
  definition = codeDefinition(),
  createdByUserId = null,
}: {
  targetProjectId?: string;
  name?: string;
  description?: string | null;
  definition?: EvaluatorDefinitionForPersistence;
  createdByUserId?: string | null;
} = {}) =>
  evaluatorRepository.createEvaluator({
    prisma,
    input: {
      projectId: targetProjectId,
      name,
      description,
      definition,
    },
    createdByUserId,
  });

const createRuleAssignment = async ({
  targetProjectId = projectId,
  evaluatorId,
  status = "ACTIVE",
  assignmentId = `assignment-${randomUUID()}`,
}: {
  targetProjectId?: string;
  evaluatorId: string;
  status?: "ACTIVE" | "INACTIVE";
  assignmentId?: string;
}) => {
  const rule = await prisma.evaluationRule.create({
    data: {
      projectId: targetProjectId,
      name: `rule-${randomUUID()}`,
      status,
      targetObject: "EVENT",
      filter: [],
      sampling: 1,
      delay: 0,
      assignments: {
        create: {
          id: assignmentId,
          projectId: targetProjectId,
          evaluatorId,
          variableMapping: {},
        },
      },
    },
  });

  return { rule, assignmentId };
};

const createEvaluatorWithThreeVersions = async () => {
  const evaluator = await createEvaluator({
    createdByUserId: creatorUserId,
  });
  await prisma.$transaction(async (tx) => {
    await evaluatorRepository.appendEvaluatorVersion({
      tx,
      evaluatorId: evaluator.id,
      version: 2,
      definition: codeDefinition("return 2;"),
      createdByUserId: null,
    });
    await evaluatorRepository.appendEvaluatorVersion({
      tx,
      evaluatorId: evaluator.id,
      version: 3,
      definition: codeDefinition("return 3;"),
      createdByUserId: null,
    });
  });
  return evaluator;
};

const provisionDefaultEvalModel = async (model: string) => {
  const provider = `openai-${randomUUID()}`;
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
      model,
    },
  });
};

beforeAll(async () => {
  const [first, second, creator] = await Promise.all([
    createOrgProjectAndApiKey(),
    createOrgProjectAndApiKey(),
    prisma.user.create({
      data: {
        name: "Evaluator creator",
        email: `${randomUUID()}@example.com`,
      },
    }),
  ]);
  projectId = first.project.id;
  otherProjectId = second.project.id;
  creatorUserId = creator.id;
  orgIds.push(first.org.id, second.org.id);
});

afterEach(async () => {
  await prisma.evaluationRule.deleteMany({
    where: { projectId: { in: [projectId, otherProjectId] } },
  });
  await prisma.evaluator.deleteMany({
    where: { projectId: { in: [projectId, otherProjectId] } },
  });
  await prisma.defaultLlmModel.deleteMany({
    where: { projectId: { in: [projectId, otherProjectId] } },
  });
  await prisma.llmApiKeys.deleteMany({
    where: { projectId: { in: [projectId, otherProjectId] } },
  });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.delete({ where: { id: creatorUserId } });
});

describe("evaluator v2 repository", () => {
  describe("listEvaluators", () => {
    it("returns an empty list", async () => {
      await expect(
        evaluatorRepository.listEvaluators({
          prisma,
          projectId,
          page: 1,
          limit: 50,
        }),
      ).resolves.toEqual({ evaluators: [], totalItems: 0 });
    });

    it("returns matching project evaluators with their list data", async () => {
      const matching = await createEvaluator({
        name: "Quality match",
        createdByUserId: creatorUserId,
      });
      await Promise.all([
        createEvaluator({ name: "Unrelated" }),
        createEvaluator({
          targetProjectId: otherProjectId,
          name: "Other project match",
        }),
      ]);
      await prisma.$transaction((tx) =>
        evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: matching.id,
          version: 2,
          definition: codeDefinition("return 2;"),
          createdByUserId: null,
        }),
      );
      await Promise.all([
        createRuleAssignment({ evaluatorId: matching.id, status: "ACTIVE" }),
        createRuleAssignment({ evaluatorId: matching.id, status: "INACTIVE" }),
      ]);
      await createRuleAssignment({
        targetProjectId: otherProjectId,
        evaluatorId: matching.id,
        status: "ACTIVE",
      });

      const result = await evaluatorRepository.listEvaluators({
        prisma,
        projectId,
        page: 1,
        limit: 50,
        search: "MATCH",
      });

      expect(result).toMatchObject({
        evaluators: [
          {
            id: matching.id,
            projectId,
            name: "Quality match",
            createdByUser: {
              name: "Evaluator creator",
              email: expect.any(String),
            },
            versions: [{ version: 2, sourceCode: "return 2;" }],
            _count: { assignments: 2 },
            hasActiveRules: true,
          },
        ],
        totalItems: 1,
      });
    });

    it("preserves default update order and supports explicit creation order", async () => {
      const [recentlyUpdated, newerButUnchanged] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
      ]);

      await Promise.all([
        prisma.evaluator.update({
          where: { id: recentlyUpdated.id },
          data: {
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-03T00:00:00.000Z"),
          },
        }),
        prisma.evaluator.update({
          where: { id: newerButUnchanged.id },
          data: {
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
            updatedAt: new Date("2026-01-02T00:00:00.000Z"),
          },
        }),
      ]);

      await expect(
        evaluatorRepository.listEvaluators({
          prisma,
          projectId,
          page: 1,
          limit: 1,
        }),
      ).resolves.toEqual({
        evaluators: [expect.objectContaining({ id: recentlyUpdated.id })],
        totalItems: 2,
      });

      await expect(
        evaluatorRepository.listEvaluators({
          prisma,
          projectId,
          page: 2,
          limit: 1,
        }),
      ).resolves.toEqual({
        evaluators: [expect.objectContaining({ id: newerButUnchanged.id })],
        totalItems: 2,
      });

      await expect(
        evaluatorRepository.listEvaluators({
          prisma,
          projectId,
          page: 1,
          limit: 2,
          orderBy: { column: "createdAt", order: "DESC" },
        }),
      ).resolves.toEqual({
        evaluators: [
          expect.objectContaining({ id: newerButUnchanged.id }),
          expect.objectContaining({ id: recentlyUpdated.id }),
        ],
        totalItems: 2,
      });
    });

    it("filters evaluators by name, status, type, and creator", async () => {
      const matching = await createEvaluator({
        name: "Production quality judge",
        definition: llmDefinition(),
        createdByUserId: creatorUserId,
      });
      await createRuleAssignment({
        evaluatorId: matching.id,
        status: "ACTIVE",
      });
      await Promise.all([
        createEvaluator({
          name: "Production code evaluator",
          definition: codeDefinition(),
          createdByUserId: creatorUserId,
        }),
        createEvaluator({
          name: "Production API judge",
          definition: llmDefinition(),
        }),
        createEvaluator({
          targetProjectId: otherProjectId,
          name: "Production quality judge",
          definition: llmDefinition(),
          createdByUserId: creatorUserId,
        }),
      ]);

      const result = await evaluatorRepository.listEvaluators({
        prisma,
        projectId,
        page: 1,
        limit: 50,
        filter: [
          {
            column: "name",
            type: "string",
            operator: "contains",
            value: "quality",
          },
          {
            column: "status",
            type: "stringOptions",
            operator: "any of",
            value: ["ACTIVE"],
          },
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["LLM_AS_JUDGE"],
          },
          {
            column: "creator",
            type: "string",
            operator: "contains",
            value: "Evaluator creator",
          },
        ],
      });

      expect(result).toEqual({
        evaluators: [expect.objectContaining({ id: matching.id })],
        totalItems: 1,
      });
    });

    it("filters blocked and API-created evaluators", async () => {
      const matching = await createEvaluator({ name: "Blocked API evaluator" });
      await prisma.evaluator.update({
        where: { id: matching.id },
        data: { blockedAt: new Date() },
      });
      await createEvaluator({ name: "Inactive API evaluator" });

      const result = await evaluatorRepository.listEvaluators({
        prisma,
        projectId,
        page: 1,
        limit: 50,
        filter: [
          {
            column: "status",
            type: "stringOptions",
            operator: "any of",
            value: ["BLOCKED"],
          },
          { column: "creator", type: "string", operator: "=", value: "API" },
        ],
      });

      expect(result).toEqual({
        evaluators: [expect.objectContaining({ id: matching.id })],
        totalItems: 1,
      });
    });

    it("filters evaluator names and creators using selector values", async () => {
      const matching = await createEvaluator({
        name: "Selected evaluator",
        createdByUserId: creatorUserId,
      });
      await Promise.all([
        createEvaluator({
          name: "Other evaluator",
          createdByUserId: creatorUserId,
        }),
        createEvaluator({ name: "Selected evaluator" }),
      ]);

      const result = await evaluatorRepository.listEvaluators({
        prisma,
        projectId,
        page: 1,
        limit: 50,
        filter: [
          {
            column: "name",
            type: "stringOptions",
            operator: "any of",
            value: ["Selected evaluator"],
          },
          {
            column: "creator",
            type: "stringOptions",
            operator: "any of",
            value: ["Evaluator creator"],
          },
        ],
      });

      expect(result).toEqual({
        evaluators: [expect.objectContaining({ id: matching.id })],
        totalItems: 1,
      });
    });

    it("filters evaluators by their effective latest model", async () => {
      await provisionDefaultEvalModel("project-default-model");
      const [explicitMatch, inheritedMatch, historicalOnly, codeEvaluator] =
        await Promise.all([
          createEvaluator({
            name: "Explicit match",
            definition: llmDefinition({ model: "selected-model" }),
          }),
          createEvaluator({
            name: "Inherited match",
            definition: llmDefinition(),
          }),
          createEvaluator({
            name: "Historical only",
            definition: llmDefinition({ model: "selected-model" }),
          }),
          createEvaluator({ name: "Code evaluator" }),
        ]);
      await prisma.$transaction((tx) =>
        evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: historicalOnly.id,
          version: 2,
          definition: llmDefinition({ model: "new-model" }),
          createdByUserId: null,
        }),
      );

      await expect(
        evaluatorRepository.listEvaluators({
          prisma,
          projectId,
          page: 1,
          limit: 50,
          filter: [
            {
              column: "model",
              type: "stringOptions",
              operator: "any of",
              value: ["selected-model", "project-default-model"],
            },
          ],
        }),
      ).resolves.toMatchObject({
        evaluators: expect.arrayContaining([
          expect.objectContaining({
            id: explicitMatch.id,
            effectiveModel: "selected-model",
          }),
          expect.objectContaining({
            id: inheritedMatch.id,
            effectiveModel: "project-default-model",
          }),
        ]),
        totalItems: 2,
      });

      await expect(
        evaluatorRepository.listEvaluators({
          prisma,
          projectId,
          page: 1,
          limit: 50,
          filter: [
            {
              column: "model",
              type: "string",
              operator: "contains",
              value: "DEFAULT",
            },
          ],
        }),
      ).resolves.toMatchObject({
        evaluators: [expect.objectContaining({ id: inheritedMatch.id })],
        totalItems: 1,
      });

      await expect(
        evaluatorRepository.listEvaluators({
          prisma,
          projectId,
          page: 1,
          limit: 50,
          filter: [
            {
              column: "model",
              type: "stringOptions",
              operator: "none of",
              value: ["selected-model", "project-default-model"],
            },
          ],
        }),
      ).resolves.toMatchObject({
        evaluators: expect.arrayContaining([
          expect.objectContaining({ id: historicalOnly.id }),
          expect.objectContaining({ id: codeEvaluator.id }),
        ]),
        totalItems: 2,
      });
    });
  });

  describe("listEvaluatorFilterOptions", () => {
    it("returns distinct project-scoped names and displayed creators", async () => {
      await Promise.all([
        createEvaluator({
          name: "Alpha evaluator",
          createdByUserId: creatorUserId,
        }),
        createEvaluator({ name: "Alpha evaluator" }),
        createEvaluator({ name: "Beta evaluator" }),
        createEvaluator({
          targetProjectId: otherProjectId,
          name: "Foreign evaluator",
        }),
      ]);

      await expect(
        evaluatorRepository.listEvaluatorFilterOptions({ prisma, projectId }),
      ).resolves.toEqual({
        name: ["Alpha evaluator", "Beta evaluator"],
        creator: ["API", "Evaluator creator"],
        model: [],
      });
    });

    it("returns distinct effective latest models", async () => {
      await provisionDefaultEvalModel("project-default-model");
      const historicalOnly = await createEvaluator({
        definition: llmDefinition({ model: "old-model" }),
      });
      await Promise.all([
        createEvaluator({
          definition: llmDefinition({ model: "explicit-model" }),
        }),
        createEvaluator({ definition: llmDefinition() }),
        createEvaluator(),
      ]);
      await prisma.$transaction((tx) =>
        evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: historicalOnly.id,
          version: 2,
          definition: llmDefinition({ model: "explicit-model" }),
          createdByUserId: null,
        }),
      );

      await expect(
        evaluatorRepository.listEvaluatorFilterOptions({ prisma, projectId }),
      ).resolves.toMatchObject({
        model: ["explicit-model", "project-default-model"],
      });
    });
  });

  describe("listEvaluatorIds", () => {
    it("returns all evaluator IDs from the requested project", async () => {
      const [first, second] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
        createEvaluator({ targetProjectId: otherProjectId }),
      ]);

      const ids = await evaluatorRepository.listEvaluatorIds({
        prisma,
        projectId,
      });

      expect(new Set(ids)).toEqual(new Set([first.id, second.id]));
    });

    it("filters IDs by name case-insensitively", async () => {
      const [first, second] = await Promise.all([
        createEvaluator({ name: "Quality Judge" }),
        createEvaluator({ name: "quality checker" }),
        createEvaluator({ name: "Toxicity" }),
        createEvaluator({
          targetProjectId: otherProjectId,
          name: "quality from another project",
        }),
      ]);

      const ids = await evaluatorRepository.listEvaluatorIds({
        prisma,
        projectId,
        search: "QUALITY",
      });

      expect(new Set(ids)).toEqual(new Set([first.id, second.id]));
    });

    it("filters IDs with the same filters used by select-all actions", async () => {
      const matching = await createEvaluator({
        definition: llmDefinition(),
        createdByUserId: creatorUserId,
      });
      await Promise.all([
        createEvaluator({
          definition: codeDefinition(),
          createdByUserId: creatorUserId,
        }),
        createEvaluator({ definition: llmDefinition() }),
      ]);

      await expect(
        evaluatorRepository.listEvaluatorIds({
          prisma,
          projectId,
          filter: [
            {
              column: "type",
              type: "stringOptions",
              operator: "any of",
              value: ["LLM_AS_JUDGE"],
            },
            {
              column: "creator",
              type: "string",
              operator: "contains",
              value: "Evaluator creator",
            },
          ],
        }),
      ).resolves.toEqual([matching.id]);
    });

    it("returns an empty list", async () => {
      await expect(
        evaluatorRepository.listEvaluatorIds({
          prisma,
          projectId,
        }),
      ).resolves.toEqual([]);
    });
  });

  describe("countProjectEvaluators", () => {
    it("counts only requested evaluators in the project", async () => {
      const [first, second, foreign] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
        createEvaluator({ targetProjectId: otherProjectId }),
      ]);

      await expect(
        evaluatorRepository.countProjectEvaluators({
          prisma,
          projectId,
          evaluatorIds: [first.id, second.id, foreign.id, "missing"],
        }),
      ).resolves.toBe(2);
    });
  });

  describe("listEvaluatorOptions", () => {
    it("returns an empty list", async () => {
      await expect(
        evaluatorRepository.listEvaluatorOptions({
          prisma,
          projectId,
          limit: 50,
        }),
      ).resolves.toEqual([]);
    });

    it("returns limited matching options with their latest version", async () => {
      const matching = await createEvaluator({
        name: "Quality judge",
        createdByUserId: creatorUserId,
      });
      await Promise.all([
        createEvaluator({ name: "Unrelated" }),
        createEvaluator({
          targetProjectId: otherProjectId,
          name: "Quality foreign",
        }),
      ]);
      await prisma.$transaction((tx) =>
        evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: matching.id,
          version: 2,
          definition: codeDefinition("return 2;"),
          createdByUserId: null,
        }),
      );

      await expect(
        evaluatorRepository.listEvaluatorOptions({
          prisma,
          projectId,
          search: "QUALITY",
          limit: 1,
        }),
      ).resolves.toMatchObject([
        {
          id: matching.id,
          name: "Quality judge",
          updatedAt: expect.any(Date),
          createdByUser: {
            name: "Evaluator creator",
            email: expect.any(String),
          },
          latestVersion: { version: 2 },
        },
      ]);
    });

    it("excludes evaluators attached to legacy rules when requested", async () => {
      const [standalone, legacy] = await Promise.all([
        createEvaluator({ name: "Standalone batch evaluator" }),
        createEvaluator({ name: "Legacy trace evaluator" }),
      ]);
      await prisma.evaluationRule.create({
        data: {
          projectId,
          name: "Legacy trace rule",
          status: "ACTIVE",
          targetObject: "trace",
          filter: [],
          sampling: 1,
          delay: 0,
          assignments: {
            create: {
              projectId,
              evaluatorId: legacy.id,
            },
          },
        },
      });

      await expect(
        evaluatorRepository.listEvaluatorOptions({
          prisma,
          projectId,
          limit: 50,
          excludeLegacyEvaluators: true,
        }),
      ).resolves.toEqual([expect.objectContaining({ id: standalone.id })]);
    });
  });

  describe("findEvaluator", () => {
    it("returns only the latest version", async () => {
      const evaluator = await createEvaluator();
      await prisma.$transaction((tx) =>
        evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: evaluator.id,
          version: 2,
          definition: codeDefinition("return 2;"),
          createdByUserId: null,
        }),
      );

      await expect(
        evaluatorRepository.findEvaluator({
          prisma,
          projectId,
          evaluatorId: evaluator.id,
        }),
      ).resolves.toMatchObject({
        id: evaluator.id,
        versions: [{ version: 2, sourceCode: "return 2;" }],
      });
    });

    it("returns null when the evaluator is unavailable", async () => {
      const evaluator = await createEvaluator();

      await expect(
        evaluatorRepository.findEvaluator({
          prisma,
          projectId: otherProjectId,
          evaluatorId: evaluator.id,
        }),
      ).resolves.toBeNull();
      await expect(
        evaluatorRepository.findEvaluator({
          prisma,
          projectId,
          evaluatorId: "missing-evaluator",
        }),
      ).resolves.toBeNull();
    });
  });

  describe("listEvaluatorVersions", () => {
    it("returns an empty list", async () => {
      await expect(
        evaluatorRepository.listEvaluatorVersions({
          prisma,
          projectId,
          evaluatorId: "missing-evaluator",
          limit: 2,
        }),
      ).resolves.toEqual({ data: [], nextCursor: undefined });
    });

    it("paginates versions in descending order with their creators", async () => {
      const evaluator = await createEvaluatorWithThreeVersions();

      await expect(
        evaluatorRepository.listEvaluatorVersions({
          prisma,
          projectId,
          evaluatorId: evaluator.id,
          limit: 2,
        }),
      ).resolves.toMatchObject({
        data: [
          { version: 3, createdByUser: null },
          { version: 2, createdByUser: null },
        ],
        nextCursor: 2,
      });
      await expect(
        evaluatorRepository.listEvaluatorVersions({
          prisma,
          projectId,
          evaluatorId: evaluator.id,
          cursor: 2,
          limit: 2,
        }),
      ).resolves.toMatchObject({
        data: [
          {
            version: 1,
            createdByUser: {
              name: "Evaluator creator",
              email: expect.any(String),
            },
          },
        ],
        nextCursor: undefined,
      });
      await expect(
        evaluatorRepository.listEvaluatorVersions({
          prisma,
          projectId,
          evaluatorId: evaluator.id,
          cursor: 1,
          limit: 2,
        }),
      ).resolves.toEqual({ data: [], nextCursor: undefined });
      await expect(
        evaluatorRepository.listEvaluatorVersions({
          prisma,
          projectId: otherProjectId,
          evaluatorId: evaluator.id,
          limit: 2,
        }),
      ).resolves.toEqual({ data: [], nextCursor: undefined });
    });
  });

  describe("findEvaluatorsByName", () => {
    it("returns an empty list", async () => {
      await expect(
        evaluatorRepository.findEvaluatorsByName({
          prisma,
          projectId,
          name: "missing",
        }),
      ).resolves.toEqual([]);
    });

    it("returns at most two exact-name matches from the requested project", async () => {
      await Promise.all([
        createEvaluator({ name: "Duplicate name" }),
        createEvaluator({ name: "Duplicate name" }),
        createEvaluator({ name: "Duplicate name" }),
        createEvaluator({ name: "duplicate name" }),
        createEvaluator({
          targetProjectId: otherProjectId,
          name: "Duplicate name",
        }),
      ]);

      const matches = await evaluatorRepository.findEvaluatorsByName({
        prisma,
        projectId,
        name: "Duplicate name",
      });
      expect(matches).toHaveLength(2);
      expect(matches).toEqual([
        expect.objectContaining({
          projectId,
          name: "Duplicate name",
          versions: [expect.objectContaining({ version: 1 })],
        }),
        expect.objectContaining({
          projectId,
          name: "Duplicate name",
          versions: [expect.objectContaining({ version: 1 })],
        }),
      ]);
    });
  });

  describe("createEvaluator", () => {
    it("persists a code evaluator", async () => {
      const codeEvaluator = await createEvaluator({
        name: "Code evaluator",
        description: "Runs code",
        definition: codeDefinition("return input.value;"),
      });
      expect(codeEvaluator).toMatchObject({
        projectId,
        name: "Code evaluator",
        description: "Runs code",
        type: "CODE",
        createdByUserId: null,
        versions: [
          {
            version: 1,
            sourceCode: "return input.value;",
            sourceCodeLanguage: "TYPESCRIPT",
            variableMapping: getCodeEvalVariableMapping(),
            prompt: null,
          },
        ],
      });
    });

    it("round-trips ordered prompt messages across evaluator versions", async () => {
      const evaluator = await createEvaluator({
        definition: llmDefinition({
          promptMessages: [
            { role: "system", content: "Judge carefully" },
            { role: "user", content: "Judge {{output}}" },
          ],
        }),
      });

      await prisma.$transaction((tx) =>
        evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: evaluator.id,
          version: 2,
          definition: llmDefinition({
            promptMessages: [
              { role: "system", content: "Judge very carefully" },
              { role: "user", content: "Judge {{output}}" },
              { role: "assistant", content: "Return a score" },
            ],
          }),
          createdByUserId: null,
        }),
      );

      const versions = await evaluatorRepository.listEvaluatorVersions({
        prisma,
        projectId,
        evaluatorId: evaluator.id,
        limit: 10,
      });
      expect(
        versions.data.map(({ version, promptMessages }) => ({
          version,
          promptMessages,
        })),
      ).toEqual([
        {
          version: 2,
          promptMessages: [
            { role: "system", content: "Judge very carefully" },
            { role: "user", content: "Judge {{output}}" },
            { role: "assistant", content: "Return a score" },
          ],
        },
        {
          version: 1,
          promptMessages: [
            { role: "system", content: "Judge carefully" },
            { role: "user", content: "Judge {{output}}" },
          ],
        },
      ]);
    });

    it("persists LLM evaluator fields", async () => {
      const [nullableLlmEvaluator, configuredLlmEvaluator] = await Promise.all([
        createEvaluator({
          name: "Nullable LLM evaluator",
          definition: llmDefinition(),
          createdByUserId: creatorUserId,
        }),
        createEvaluator({
          name: "Configured LLM evaluator",
          definition: llmDefinition({
            provider: "openai",
            model: "gpt-test",
            modelParams: { temperature: 0.2 },
            variableMapping: [
              { templateVariable: "output", selectedColumnId: "output" },
            ],
          }),
        }),
      ]);

      expect(nullableLlmEvaluator).toMatchObject({
        type: "LLM_AS_JUDGE",
        createdByUserId: creatorUserId,
        versions: [
          {
            version: 1,
            createdByUserId: creatorUserId,
            prompt: "Judge {{output}}",
            modelParams: null,
            variableMapping: null,
            sourceCode: null,
          },
        ],
      });

      const [nullStorage] = await prisma.$queryRaw<
        Array<{
          variable_mapping_is_null: boolean;
          model_params_is_null: boolean;
        }>
      >(Prisma.sql`
        SELECT
          variable_mapping IS NULL AS variable_mapping_is_null,
          model_params IS NULL AS model_params_is_null
        FROM evaluator_versions
        WHERE id = ${nullableLlmEvaluator.versions[0].id}
      `);
      expect(nullStorage).toEqual({
        variable_mapping_is_null: true,
        model_params_is_null: true,
      });

      expect(configuredLlmEvaluator.versions[0]).toMatchObject({
        provider: "openai",
        model: "gpt-test",
        modelParams: { temperature: 0.2 },
        variableMapping: [
          { templateVariable: "output", selectedColumnId: "output" },
        ],
        outputDefinition: expect.objectContaining({ dataType: "NUMERIC" }),
      });
    });
  });

  describe("updateEvaluatorMetadata", () => {
    it("updates evaluator metadata without changing versions", async () => {
      const evaluator = await createEvaluator({
        name: "Before",
        description: "Old description",
      });

      await prisma.$transaction((tx) =>
        evaluatorRepository.updateEvaluatorMetadata({
          tx,
          projectId,
          evaluatorId: evaluator.id,
          name: "After",
          description: null,
        }),
      );
      await expect(
        evaluatorRepository.findEvaluator({
          prisma,
          projectId,
          evaluatorId: evaluator.id,
        }),
      ).resolves.toMatchObject({
        name: "After",
        description: null,
        versions: [{ version: 1 }],
      });
    });

    it("rejects updates through another project", async () => {
      const evaluator = await createEvaluator({ name: "Before" });

      await expect(
        prisma.$transaction((tx) =>
          evaluatorRepository.updateEvaluatorMetadata({
            tx,
            projectId: otherProjectId,
            evaluatorId: evaluator.id,
            name: "Cross-project rename",
            description: null,
          }),
        ),
      ).rejects.toMatchObject({ code: "P2025" });
      await expect(
        prisma.evaluator.findUniqueOrThrow({ where: { id: evaluator.id } }),
      ).resolves.toMatchObject({ name: "Before" });
    });
  });

  describe("appendEvaluatorVersion", () => {
    it("persists the requested version", async () => {
      const evaluator = await createEvaluator();
      const appended = await prisma.$transaction((tx) =>
        evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: evaluator.id,
          version: 2,
          definition: codeDefinition("return 2;"),
          createdByUserId: creatorUserId,
        }),
      );
      expect(appended).toMatchObject({
        evaluatorId: evaluator.id,
        version: 2,
        sourceCode: "return 2;",
        createdByUserId: creatorUserId,
      });
    });

    it("translates a duplicate version into a conflict", async () => {
      const evaluator = await createEvaluator();
      await prisma.$transaction((tx) =>
        evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: evaluator.id,
          version: 2,
          definition: codeDefinition("return 2;"),
          createdByUserId: null,
        }),
      );

      await expect(
        prisma.$transaction((tx) =>
          evaluatorRepository.appendEvaluatorVersion({
            tx,
            evaluatorId: evaluator.id,
            version: 2,
            definition: codeDefinition("return duplicate;"),
            createdByUserId: null,
          }),
        ),
      ).rejects.toBeInstanceOf(EvaluatorVersionConflictError);
      await expect(
        prisma.evaluatorVersion.count({
          where: { evaluatorId: evaluator.id },
        }),
      ).resolves.toBe(2);
    });
  });

  describe("deleteEvaluator", () => {
    it("returns false without deleting unavailable evaluators", async () => {
      const evaluator = await createEvaluator();

      await expect(
        evaluatorRepository.deleteEvaluator({
          prisma,
          projectId: otherProjectId,
          evaluatorId: evaluator.id,
        }),
      ).resolves.toBe(false);
      await expect(
        prisma.evaluator.findUnique({ where: { id: evaluator.id } }),
      ).resolves.not.toBeNull();
      await expect(
        evaluatorRepository.deleteEvaluator({
          prisma,
          projectId,
          evaluatorId: "missing-evaluator",
        }),
      ).resolves.toBe(false);
    });

    it("deletes the evaluator and cascades owned records", async () => {
      const evaluator = await createEvaluator();
      const { rule, assignmentId } = await createRuleAssignment({
        evaluatorId: evaluator.id,
      });
      const unrelatedRule = await prisma.evaluationRule.create({
        data: {
          projectId,
          name: `rule-${randomUUID()}`,
          status: "ACTIVE",
          targetObject: "EVENT",
          filter: [],
          sampling: 1,
          delay: 0,
        },
      });

      await expect(
        evaluatorRepository.deleteEvaluator({
          prisma,
          projectId,
          evaluatorId: evaluator.id,
        }),
      ).resolves.toBe(true);
      await expect(
        prisma.evaluatorVersion.count({
          where: { evaluatorId: evaluator.id },
        }),
      ).resolves.toBe(0);
      await expect(
        prisma.evaluationRuleEvaluatorAssignment.findUnique({
          where: { id: assignmentId },
        }),
      ).resolves.toBeNull();
      await expect(
        prisma.evaluationRule.findMany({
          where: { id: { in: [rule.id, unrelatedRule.id] } },
          orderBy: { id: "asc" },
          select: { id: true, status: true },
        }),
      ).resolves.toEqual(
        [
          { id: rule.id, status: "INACTIVE" },
          { id: unrelatedRule.id, status: "ACTIVE" },
        ].sort((left, right) => left.id.localeCompare(right.id)),
      );
    });
  });
});
