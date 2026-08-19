import { EvalTargetObject } from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  ChatMessageRole,
  ChatMessageType,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import type * as SharedServer from "@langfuse/shared/src/server";
import type * as EnvModule from "@/src/env.mjs";
import type * as EvaluatorPreflightModule from "@/src/features/evals/server/evaluator-preflight";
import type * as TestEvaluatorModule from "@/src/features/evals/v2/server/evaluators/testEvaluator";
import type * as EvaluatorValidationModule from "@/src/features/evals/v2/server/evaluators/evaluatorValidation";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { EvaluatorService } from "@/src/features/evals/v2/server/evaluators/evaluatorService";
import {
  EvaluatorConfigurationError,
  EvaluatorModelConfigurationError,
  EvaluatorVersionConflictError,
} from "@/src/features/evals/v2/server/evaluators/evaluatorErrors";
import * as evaluatorRepository from "@/src/features/evals/v2/server/evaluators/evaluatorRepository";
import type {
  CreateEvaluatorInput,
  EvaluatorDefinition,
} from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";
import { EvaluatorVersionsSchema } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";

const mocks = vi.hoisted(() => ({
  generateLangfuseAIText: vi.fn(),
  getRecentEvaluatorExecutionTraces: vi.fn(),
  assertEvaluatorConfigurationValid: vi.fn(),
  getEvaluatorDefinitionPreflightError: vi.fn(),
  testEvaluator: vi.fn(),
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
    LANGFUSE_AWS_BEDROCK_SMALL_MODEL: "test-small-model",
    LANGFUSE_AWS_BEDROCK_MODEL: "test-model",
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "events_only",
  } as {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: string | undefined;
    LANGFUSE_AWS_BEDROCK_SMALL_MODEL: string | undefined;
    LANGFUSE_AWS_BEDROCK_MODEL: string | undefined;
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "legacy" | "dual" | "events_only";
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServer>()),
  generateLangfuseAIText: mocks.generateLangfuseAIText,
  getRecentEvaluatorExecutionTraces: mocks.getRecentEvaluatorExecutionTraces,
}));

vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    env: Object.assign(mocks.env, actual.env, {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
      LANGFUSE_AWS_BEDROCK_SMALL_MODEL: "test-small-model",
      LANGFUSE_AWS_BEDROCK_MODEL: "test-model",
      LANGFUSE_MIGRATION_V4_WRITE_MODE: "events_only",
    }),
  };
});

vi.mock(
  "@/src/features/evals/v2/server/evaluators/testEvaluator",
  async (importOriginal) => ({
    ...(await importOriginal<typeof TestEvaluatorModule>()),
    testEvaluator: mocks.testEvaluator,
  }),
);

vi.mock(
  "@/src/features/evals/v2/server/evaluators/evaluatorValidation",
  async (importOriginal) => ({
    ...(await importOriginal<typeof EvaluatorValidationModule>()),
    assertEvaluatorConfigurationValid: mocks.assertEvaluatorConfigurationValid,
  }),
);

vi.mock(
  "@/src/features/evals/server/evaluator-preflight",
  async (importOriginal) => ({
    ...(await importOriginal<typeof EvaluatorPreflightModule>()),
    getEvaluatorDefinitionPreflightError:
      mocks.getEvaluatorDefinitionPreflightError,
  }),
);

const orgIds: string[] = [];
let orgId = "";
let projectId = "";
let otherProjectId = "";

const llmInput = (
  name: string,
): CreateEvaluatorInput & {
  definition: Extract<EvaluatorDefinition, { type: "LLM_AS_JUDGE" }>;
} => ({
  projectId,
  name,
  description: "Initial description",
  definition: {
    type: "LLM_AS_JUDGE",
    prompt: "Judge {{output}}",
    provider: null,
    model: null,
    modelParams: null,
    vars: ["output"],
    variableMapping: [
      { templateVariable: "output", selectedColumnId: "output" },
    ],
    outputDefinition: {
      version: 2,
      dataType: "NUMERIC",
      score: { description: "Quality" },
      reasoning: { description: "Reasoning" },
    },
  },
});

const createService = () => new EvaluatorService(prisma, async () => undefined);

beforeAll(async () => {
  const [first, second] = await Promise.all([
    createOrgProjectAndApiKey(),
    createOrgProjectAndApiKey(),
  ]);
  projectId = first.project.id;
  otherProjectId = second.project.id;
  orgId = first.org.id;
  orgIds.push(first.org.id, second.org.id);
  await prisma.organization.update({
    where: { id: first.org.id },
    data: { aiFeaturesEnabled: true },
  });
});

beforeEach(() => {
  mocks.generateLangfuseAIText.mockReset();
  mocks.getRecentEvaluatorExecutionTraces.mockReset();
  mocks.assertEvaluatorConfigurationValid.mockReset();
  mocks.assertEvaluatorConfigurationValid.mockResolvedValue(undefined);
  mocks.getEvaluatorDefinitionPreflightError.mockReset();
  mocks.getEvaluatorDefinitionPreflightError.mockResolvedValue(null);
  mocks.testEvaluator.mockReset();
  mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
  mocks.env.LANGFUSE_AWS_BEDROCK_SMALL_MODEL = "test-small-model";
  mocks.env.LANGFUSE_AWS_BEDROCK_MODEL = "test-model";
  mocks.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
});

afterEach(async () => {
  await prisma.evaluationRule.deleteMany({
    where: { projectId: { in: [projectId, otherProjectId] } },
  });
  await prisma.evaluator.deleteMany({
    where: { projectId: { in: [projectId, otherProjectId] } },
  });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("EvaluatorService", () => {
  it("lists evaluators with pagination and project isolation", async () => {
    const service = createService();
    const [older, newer] = await Promise.all([
      service.create(llmInput("Older evaluator"), null),
      service.create(llmInput("Newer evaluator"), null),
      service.create(
        { ...llmInput("Other project evaluator"), projectId: otherProjectId },
        null,
      ),
    ]);
    await Promise.all([
      prisma.evaluator.update({
        where: { id: older.id },
        data: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
      }),
      prisma.evaluator.update({
        where: { id: newer.id },
        data: { createdAt: new Date("2026-01-02T00:00:00.000Z") },
      }),
    ]);

    await expect(
      service.list({ projectId, page: 1, limit: 1 }),
    ).resolves.toMatchObject({
      evaluators: [{ id: newer.id }],
      totalItems: 2,
    });
    await expect(
      service.list({ projectId, page: 2, limit: 1 }),
    ).resolves.toMatchObject({
      evaluators: [{ id: older.id }],
      totalItems: 2,
    });
  });

  it("creates an evaluator with version one and rejects cross-project reads", async () => {
    const service = createService();
    const evaluatorId = crypto.randomUUID();
    const created = await service.create(
      { ...llmInput("Create evaluator"), evaluatorId },
      null,
    );

    expect(created).toMatchObject({
      id: evaluatorId,
      projectId,
      name: "Create evaluator",
      versions: [expect.objectContaining({ version: 1 })],
    });
    await expect(service.get(projectId, created.id)).resolves.toMatchObject({
      id: created.id,
    });
    await expect(service.get(otherProjectId, created.id)).rejects.toThrow(
      "Evaluator not found",
    );
  });

  it("audits successful evaluator mutations", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const service = new EvaluatorService(prisma, audit);
    const input = llmInput("Audited evaluator");

    const created = await service.create(input, null);
    await service.update(
      {
        ...input,
        evaluatorId: created.id,
        name: "Updated audited evaluator",
      },
      null,
    );
    await service.delete(projectId, created.id);

    expect(audit.mock.calls.map(([event]) => event)).toEqual([
      { action: "create", projectId, evaluatorId: created.id },
      { action: "update", projectId, evaluatorId: created.id },
      { action: "delete", projectId, evaluatorId: created.id },
    ]);
  });

  it("does not persist evaluator changes when configuration validation fails", async () => {
    const service = createService();
    mocks.assertEvaluatorConfigurationValid.mockRejectedValueOnce(
      new EvaluatorConfigurationError("Invalid evaluator configuration"),
    );

    await expect(
      service.create(llmInput("Invalid create"), null),
    ).rejects.toThrow("Invalid evaluator configuration");
    await expect(
      prisma.evaluator.count({ where: { projectId, name: "Invalid create" } }),
    ).resolves.toBe(0);

    const evaluator = await service.create(llmInput("Invalid update"), null);
    mocks.assertEvaluatorConfigurationValid.mockRejectedValueOnce(
      new EvaluatorConfigurationError("Invalid evaluator configuration"),
    );
    await expect(
      service.update(
        {
          ...llmInput("Renamed before invalid update"),
          evaluatorId: evaluator.id,
        },
        null,
      ),
    ).rejects.toThrow("Invalid evaluator configuration");
    await expect(service.get(projectId, evaluator.id)).resolves.toMatchObject({
      name: "Invalid update",
      versions: [expect.objectContaining({ version: 1 })],
    });
  });

  it("stores an evaluator with an invalid model configuration as blocked", async () => {
    const service = createService();
    mocks.assertEvaluatorConfigurationValid.mockRejectedValueOnce(
      new EvaluatorModelConfigurationError(
        'No valid LLM model found for evaluator "Invalid model". No default evaluation model configured.',
      ),
    );

    const evaluator = await service.create(llmInput("Invalid model"), null);

    expect(evaluator).toMatchObject({
      name: "Invalid model",
      blockedAt: expect.any(Date),
      blockReason: "DEFAULT_EVAL_MODEL_MISSING",
      blockMessage:
        "Evaluator paused: no default evaluation model is configured. Set a default evaluation model or update the evaluator template, then reactivate it.",
      versions: [expect.objectContaining({ version: 1 })],
    });

    mocks.assertEvaluatorConfigurationValid.mockRejectedValueOnce(
      new EvaluatorModelConfigurationError(
        'No valid LLM model found for evaluator "Invalid model". The configured model is unavailable.',
      ),
    );
    const updated = await service.update(
      {
        ...llmInput("Invalid model"),
        evaluatorId: evaluator.id,
        definition: {
          ...llmInput("Invalid model").definition,
          provider: "openai",
          model: "missing-model",
        },
      },
      null,
    );

    expect(updated).toMatchObject({
      blockedAt: expect.any(Date),
      blockReason: "EVAL_MODEL_CONFIG_INVALID",
      blockMessage:
        "Evaluator paused: no valid evaluation model is configured. Update the evaluator template or default evaluation model, then reactivate it.",
      versions: [expect.objectContaining({ version: 2 })],
    });
  });

  it("reactivates a blocked evaluator only after its model test succeeds", async () => {
    const service = createService();
    mocks.assertEvaluatorConfigurationValid.mockRejectedValueOnce(
      new EvaluatorModelConfigurationError("No default model configured"),
    );
    const evaluator = await service.create(llmInput("Reactivate model"), null);

    mocks.getEvaluatorDefinitionPreflightError.mockResolvedValueOnce(
      "The model test failed",
    );
    await expect(
      service.reactivate({ projectId, evaluatorId: evaluator.id }),
    ).rejects.toThrow("The model test failed");
    await expect(service.get(projectId, evaluator.id)).resolves.toMatchObject({
      blockedAt: expect.any(Date),
      blockReason: "DEFAULT_EVAL_MODEL_MISSING",
    });

    await expect(
      service.reactivate({ projectId, evaluatorId: evaluator.id }),
    ).resolves.toMatchObject({
      id: evaluator.id,
      blockedAt: null,
      blockReason: null,
      blockMessage: null,
    });
    expect(mocks.getEvaluatorDefinitionPreflightError).toHaveBeenCalledTimes(2);
  });

  it("creates and updates an evaluator through name-based upsert", async () => {
    const service = createService();
    const input = llmInput("Legacy evaluator");

    const created = await service.upsertByName(input, null);
    const updated = await service.upsertByName(input, null);

    expect(created).toMatchObject({
      action: "create",
      evaluator: { name: input.name, versions: [{ version: 1 }] },
    });
    expect(updated).toMatchObject({
      action: "update",
      evaluator: { id: created.evaluator.id, versions: [{ version: 2 }] },
    });
  });

  it("updates metadata without a version and appends a version for definition changes", async () => {
    const service = createService();
    const input = llmInput("Version decisions");
    const created = await service.create(input, null);

    const metadataUpdate = await service.update(
      {
        ...input,
        evaluatorId: created.id,
        name: "Renamed evaluator",
        description: "Changed only metadata",
      },
      null,
    );
    expect(metadataUpdate.versions).toHaveLength(1);
    expect(metadataUpdate).toMatchObject({
      name: "Renamed evaluator",
      description: "Changed only metadata",
    });

    const definitionUpdate = await service.update(
      {
        ...input,
        evaluatorId: created.id,
        name: "Renamed evaluator",
        description: "Changed only metadata",
        definition: {
          ...input.definition,
          prompt: "Judge {{output}} strictly",
        },
      },
      null,
    );
    expect(definitionUpdate.versions.map((version) => version.version)).toEqual(
      [2],
    );
    const firstPage = await service.listVersions({
      projectId,
      evaluatorId: created.id,
      limit: 1,
    });
    expect(firstPage).toEqual({
      data: [expect.objectContaining({ version: 2 })],
      nextCursor: "eyJ2IjoxLCJ2ZXJzaW9uIjoyfQ",
    });
    const cursor = EvaluatorVersionsSchema.parse({
      projectId,
      evaluatorId: created.id,
      cursor: firstPage.nextCursor,
      limit: 1,
    }).cursor;
    await expect(
      service.listVersions({
        projectId,
        evaluatorId: created.id,
        cursor,
        limit: 1,
      }),
    ).resolves.toEqual({
      data: [expect.objectContaining({ version: 1 })],
      nextCursor: undefined,
    });
    await expect(
      service.listVersions({
        projectId: otherProjectId,
        evaluatorId: created.id,
        limit: 1,
      }),
    ).rejects.toThrow("Evaluator not found");
  });

  it("rejects prompt changes that make existing rule mappings incomplete", async () => {
    const service = createService();
    const input = llmInput("Assigned evaluator update");
    const created = await service.create(input, null);
    await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "Assigned rule",
        status: "ACTIVE",
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 1,
        delay: 0,
        assignments: {
          create: {
            projectId,
            evaluatorId: created.id,
            variableMapping: input.definition
              .variableMapping as Prisma.InputJsonValue,
          },
        },
      },
    });

    await expect(
      service.update(
        {
          ...input,
          evaluatorId: created.id,
          name: "Invalid renamed evaluator",
          definition: {
            ...input.definition,
            prompt: "Judge {{input}} and {{output}}",
            vars: ["input", "output"],
            variableMapping: [
              { templateVariable: "input", selectedColumnId: "input" },
              { templateVariable: "output", selectedColumnId: "output" },
            ],
          },
        },
        null,
      ),
    ).rejects.toThrow("Missing mappings for evaluator variables: input");

    await expect(service.get(projectId, created.id)).resolves.toMatchObject({
      name: input.name,
      versions: [expect.objectContaining({ version: 1 })],
    });
  });

  it("returns a retryable conflict when an evaluator version advances concurrently", async () => {
    const service = createService();
    const input = llmInput("Concurrent version update");
    const created = await service.create(input, null);

    await expect(
      prisma.$transaction(async (tx) => {
        await evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: created.id,
          version: 2,
          definition: input.definition,
          createdByUserId: null,
        });
        await evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: created.id,
          version: 2,
          definition: input.definition,
          createdByUserId: null,
        });
      }),
    ).rejects.toBeInstanceOf(EvaluatorVersionConflictError);

    await expect(
      prisma.evaluatorVersion.count({ where: { evaluatorId: created.id } }),
    ).resolves.toBe(1);
  });

  it("tests an evaluator without persisting an evaluator or version", async () => {
    mocks.testEvaluator.mockResolvedValue({ score: 1 });
    const service = createService();
    const evaluator = await service.create(llmInput("Test evaluator"), null);
    const newEvaluatorId = crypto.randomUUID();
    const observation = {
      observationId: "test-observation-id",
      traceId: "test-trace-id",
      startTime: new Date("2026-08-11T00:00:00.000Z"),
      shouldReadFromObservationsTable: false,
    };
    const before = await prisma.evaluatorVersion.count({
      where: { evaluator: { projectId } },
    });

    await expect(
      service.testEvaluator({
        orgId,
        projectId,
        evaluatorId: newEvaluatorId,
        definition: llmInput("Test evaluator").definition,
        ...observation,
      }),
    ).resolves.toEqual({ score: 1 });

    await expect(
      service.testEvaluator({
        orgId,
        projectId,
        evaluatorId: evaluator.id,
        definition: llmInput("Test evaluator").definition,
        ...observation,
      }),
    ).resolves.toEqual({ score: 1 });

    expect(mocks.testEvaluator).toHaveBeenCalledTimes(2);
    expect(mocks.testEvaluator).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId,
        evaluatorId: newEvaluatorId,
        ...observation,
      }),
    );
    expect(mocks.testEvaluator).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId,
        evaluatorId: evaluator.id,
        ...observation,
      }),
    );
    await expect(
      prisma.evaluatorVersion.count({ where: { evaluator: { projectId } } }),
    ).resolves.toBe(before);

    await expect(
      service.testEvaluator({
        orgId,
        projectId: otherProjectId,
        evaluatorId: evaluator.id,
        definition: llmInput("Test evaluator").definition,
        ...observation,
      }),
    ).rejects.toThrow("Evaluator not found");
  });

  it("suggests a safe name and silently returns null when unavailable", async () => {
    mocks.generateLangfuseAIText
      .mockResolvedValueOnce('  "Concise quality judge"  ')
      .mockResolvedValueOnce(
        "I can't provide personalized advice about alcohol consumption limits, as this depends on individual factors",
      )
      .mockRejectedValueOnce(new Error("AI unavailable"));
    const service = createService();
    const definition = {
      type: "LLM_AS_JUDGE" as const,
      prompt: "Judge quality",
    };

    await expect(
      service.suggestName({ projectId, userId: null, definition }),
    ).resolves.toBe("Concise quality judge");
    expect(mocks.generateLangfuseAIText).toHaveBeenCalledOnce();
    expect(mocks.generateLangfuseAIText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: ChatMessageRole.System,
            type: ChatMessageType.System,
            content: expect.stringMatching(
              /used as the score name.*return exactly "Custom Evaluator"/,
            ),
          }),
          expect.objectContaining({
            role: ChatMessageRole.User,
            type: ChatMessageType.User,
          }),
        ],
        model: "test-small-model",
      }),
    );
    await expect(
      service.suggestName({ projectId, userId: null, definition }),
    ).resolves.toBe("Custom Evaluator");
    await expect(
      service.suggestName({ projectId, userId: null, definition }),
    ).resolves.toBeNull();

    mocks.generateLangfuseAIText.mockClear();
    mocks.env.LANGFUSE_AWS_BEDROCK_SMALL_MODEL = undefined;
    mocks.generateLangfuseAIText.mockResolvedValueOnce("Main model fallback");
    await expect(
      service.suggestName({ projectId, userId: null, definition }),
    ).resolves.toBe("Main model fallback");
    expect(mocks.generateLangfuseAIText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model" }),
    );

    mocks.generateLangfuseAIText.mockClear();
    mocks.env.LANGFUSE_AWS_BEDROCK_MODEL = undefined;
    await expect(
      service.suggestName({ projectId, userId: null, definition }),
    ).resolves.toBeNull();
    expect(mocks.generateLangfuseAIText).not.toHaveBeenCalled();

    mocks.env.LANGFUSE_AWS_BEDROCK_MODEL = "test-model";
    await expect(
      service.suggestName({
        projectId: otherProjectId,
        userId: null,
        definition,
      }),
    ).resolves.toBeNull();
    expect(mocks.generateLangfuseAIText).not.toHaveBeenCalled();
  });

  it("deletes only the evaluator in the selected project", async () => {
    const service = createService();
    const created = await service.create(llmInput("Delete evaluator"), null);

    await expect(service.delete(otherProjectId, created.id)).rejects.toThrow(
      "Evaluator not found",
    );
    await service.delete(projectId, created.id);
    await expect(service.get(projectId, created.id)).rejects.toThrow(
      "Evaluator not found",
    );
  });

  it("deletes an evaluator and its rule assignments", async () => {
    const service = createService();
    const created = await service.create(llmInput("Assigned evaluator"), null);
    const rule = await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "Assigned rule",
        status: "ACTIVE",
        targetObject: "EVENT",
        filter: [],
        sampling: 1,
        delay: 0,
        assignments: {
          create: {
            projectId,
            evaluatorId: created.id,
            variableMapping: Prisma.DbNull,
          },
        },
      },
    });

    await expect(
      prisma.evaluationRuleEvaluatorAssignment.count({
        where: { projectId, evaluatorId: created.id },
      }),
    ).resolves.toBe(1);

    await expect(
      service.delete(projectId, created.id),
    ).resolves.toBeUndefined();
    await expect(
      prisma.evaluationRuleEvaluatorAssignment.count({
        where: { evaluationRuleId: rule.id, evaluatorId: created.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.evaluationRule.findUnique({
        where: { id: rule.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "INACTIVE" });
  });

  it("deletes an explicit evaluator selection", async () => {
    const service = createService();
    const [first, second, otherProjectEvaluator] = await Promise.all([
      service.create(llmInput("First selected evaluator"), null),
      service.create(llmInput("Second selected evaluator"), null),
      service.create(
        { ...llmInput("Other project evaluator"), projectId: otherProjectId },
        null,
      ),
    ]);
    const deletedIds = await service.deleteMany({
      projectId,
      evaluatorIds: [first.id, second.id],
    });

    expect(deletedIds).toEqual([first.id, second.id]);
    await expect(
      prisma.evaluator.count({
        where: { id: { in: [first.id, second.id] } },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.evaluator.findUnique({ where: { id: otherProjectEvaluator.id } }),
    ).resolves.not.toBeNull();
  });

  it("deletes all search matches without crossing project boundaries", async () => {
    const service = createService();
    const [firstMatch, secondMatch, keep, otherProjectMatch] =
      await Promise.all([
        service.create(llmInput("Bulk match one"), null),
        service.create(llmInput("Bulk match two"), null),
        service.create(llmInput("Keep evaluator"), null),
        service.create(
          { ...llmInput("Bulk match other"), projectId: otherProjectId },
          null,
        ),
      ]);
    const deletedIds = await service.deleteMany({
      projectId,
      isBatchAction: true,
      search: "bulk match",
    });

    expect(new Set(deletedIds)).toEqual(
      new Set([firstMatch.id, secondMatch.id]),
    );
    await expect(
      prisma.evaluator.findMany({
        where: { id: { in: [keep.id, otherProjectMatch.id] } },
        select: { id: true },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([{ id: keep.id }, { id: otherProjectMatch.id }]),
    );
  });

  it("returns recent traces by evaluator execution name", async () => {
    const service = createService();
    const [firstEvaluator, secondEvaluator, otherEvaluator] = await Promise.all(
      [
        service.create(llmInput("First execution evaluator"), null),
        service.create(llmInput("Second execution evaluator"), null),
        service.create(
          {
            ...llmInput("Other project execution evaluator"),
            projectId: otherProjectId,
          },
          null,
        ),
      ],
    );
    mocks.getRecentEvaluatorExecutionTraces.mockResolvedValue([
      ...[7, 6, 5, 4, 3].map((day) => ({
        id: `first-${day}`,
        traceName: "Execute evaluator: First execution evaluator",
        level: "WARNING",
        timestamp: new Date(`2026-08-0${day}T00:00:00.000Z`),
      })),
      ...[4, 3, 2, 1].map((day) => ({
        id: `second-${day}`,
        traceName: "Execute evaluator: Second execution evaluator",
        level: "DEFAULT",
        timestamp: new Date(`2026-08-0${day}T00:00:00.000Z`),
      })),
    ]);
    const result = await service.listRecent({
      projectId,
      evaluatorIds: [firstEvaluator.id, secondEvaluator.id, otherEvaluator.id],
    });

    expect(mocks.getRecentEvaluatorExecutionTraces).toHaveBeenCalledWith(
      projectId,
      expect.any(Array),
    );
    expect(mocks.getRecentEvaluatorExecutionTraces).toHaveBeenCalledTimes(1);
    expect(
      new Set(mocks.getRecentEvaluatorExecutionTraces.mock.calls[0]?.[1]),
    ).toEqual(
      new Set([
        "Execute evaluator: First execution evaluator",
        "Execute evaluator: Second execution evaluator",
      ]),
    );
    expect(result[firstEvaluator.id]?.map(({ id }) => id)).toEqual([
      "first-7",
      "first-6",
      "first-5",
      "first-4",
      "first-3",
    ]);
    expect(result[secondEvaluator.id]?.map(({ id }) => id)).toEqual([
      "second-4",
      "second-3",
      "second-2",
      "second-1",
    ]);
    expect(result[otherEvaluator.id]).toEqual([]);
  });
});
